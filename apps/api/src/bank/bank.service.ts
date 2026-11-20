import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ExamsService, extractTikzBlocks } from '../exams/exams.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

import { compareTopics, coreKey, fullKey, isChapterName, tokenScore } from './topic-order';
@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly examsService: ExamsService,
  ) {}

  // Trợ giảng thuần: có mặt trong CourseAssistant nhưng chưa sở hữu khóa học nào
  private async isAssistantOnly(userId: string): Promise<boolean> {
    const owned = await this.prisma.course.count({ where: { teacherId: userId } });
    if (owned > 0) return false;
    const assisted = await this.prisma.courseAssistant.count({
      where: { userId },
    });
    return assisted > 0;
  }

  private async getBank(teacherId: string) {
    // Trợ giảng không được dùng ngân hàng đề
    if (await this.isAssistantOnly(teacherId)) {
      throw new ForbiddenException('Trợ giảng không có quyền sử dụng ngân hàng đề');
    }
    let bank = await this.prisma.questionBank.findUnique({
      where: { teacherId },
    });
    if (!bank) {
      bank = await this.prisma.questionBank.create({
        data: { teacherId, name: 'Ngân hàng mặc định' },
      });
    }
    return bank;
  }

  // Xoá các lệnh khoảng cách/xuống dòng hay gây lỗi khi nhập câu hỏi
  private stripSpacingCmds(s: string | null | undefined): string {
    return String(s ?? '')
      .replace(/\\break(?![a-zA-Z])/g, ' ')
      .replace(/\\qquad(?![a-zA-Z])/g, ' ')
      .replace(/\\quad(?![a-zA-Z])/g, ' ')
      // \lq\lq ... \rq\rq (mã trích dẫn LaTeX) → ngoặc kép thật, không lộ code ra màn hình
      .replace(/\\lq\\lq/g, '\u201C')
      .replace(/\\rq\\rq/g, '\u201D')
      .replace(/\\lq/g, '\u2018')
      .replace(/\\rq/g, '\u2019');
  }

  private letterFor(type: QuestionType): string {
    switch (type) {
      case QuestionType.MCQ:
        return 'A';
      case QuestionType.TRUE_FALSE:
        return 'B';
      case QuestionType.SHORT_ANSWER:
        return 'C';
      case QuestionType.ESSAY:
        return 'D';
      default:
        return 'A';
    }
  }

  private async generateUniqueCode(type: QuestionType): Promise<string> {
    const letter = this.letterFor(type);
    for (let i = 0; i < 10; i++) {
      const n = Math.floor(100000 + Math.random() * 900000);
      const code = `${letter}${n}`;
      const exists = await this.prisma.question.findUnique({ where: { code } });
      if (!exists) return code;
    }
    return `${letter}${Date.now().toString().slice(-6)}`;
  }

  // ============ NHẬP ĐỀ TỪ WORD (.docx) ============

  // Phân tích file Word → câu hỏi (chưa lưu). 0 token AI
  async previewDocxImport(teacherId: string, buffer: Buffer) {
    const bank = await this.getBank(teacherId);
    const {
      parseDocx,
      extractDocxImages,
      extractMtefLatex,
      mtefFromOle,
    } = await import('../common/docx-import.helper');
    const { questions, warnings, oleRefs, imgRefs } = parseDocx(buffer);

    // Ưu tiên 1: giải mã MTEF (MathType) → LaTeX thật
    const latexMap = extractMtefLatex(buffer, oleRefs);
    // Ưu tiên 2: ảnh (phương trình MathType không giải được + ảnh thường trong câu)
    const images = extractDocxImages(buffer, [...oleRefs, ...imgRefs], true);

    if (latexMap.size || images.size) {
      const fs = require('fs');
      const path = require('path');
      const crypto = require('crypto');
      const upDir = path.join(process.cwd(), 'storage', 'uploads');
      try {
        fs.mkdirSync(upDir, { recursive: true });
      } catch { /* bỏ qua */ }
      const replacements = new Map<string, string>();
      for (const [token, img] of images) {
        if (latexMap.has(token)) continue; // đã có LaTeX → bỏ ảnh
        const name = crypto.randomUUID() + '.' + img.ext;
        try {
          fs.writeFileSync(path.join(upDir, name), img.buffer);
          replacements.set(token, `![](/api/uploads/${name})`);
        } catch {
          /* bỏ qua ảnh lỗi */
        }
      }
      for (const [token, latex] of latexMap) {
        replacements.set(token, latex);
      }
      // Ưu tiên 3: AI vision (Gemini) đọc ảnh phương trình chưa giải mã được → LaTeX
      if (this.ai.visionConfigured()) {
        const fs = require('fs');
        const path = require('path');
        const crypto = require('crypto');
        const visDir = path.join(process.cwd(), 'storage', 'vision-math');
        try {
          fs.mkdirSync(visDir, { recursive: true });
        } catch { /* bỏ qua */ }
        // Cache theo file OLE GỐC (ổn định, không phụ thuộc cách render ảnh)
        const oleHashes = new Map<string, string>();
        try {
          const AdmZip = require('adm-zip');
          const zip = new AdmZip(buffer);
          for (const ref of oleRefs) {
            if (!ref.binTarget) continue;
            const entryName = ref.binTarget.startsWith('word/')
              ? ref.binTarget
              : 'word/' + ref.binTarget.replace(/^\//, '');
            const entry = zip.getEntry(entryName);
            if (!entry) continue;
            const data = entry.getData();
            if (data) {
              oleHashes.set(
                ref.token,
                crypto.createHash('md5').update(data).digest('hex'),
              );
            }
          }
        } catch { /* bỏ qua */ }
        let count = 0;
        // Giới hạn tổng thời gian quét AI ~60s (proxy web: 120s, tunnel: 100s)
        const deadline = Date.now() + 60000;
        const trainLog = path.join(visDir, '_training.jsonl');
        for (const ref of oleRefs) {
          if (Date.now() > deadline) break;
          if (latexMap.has(ref.token)) continue;
          const img = images.get(ref.token);
          if (!img) continue;
          const oleHash = oleHashes.get(ref.token);
          const imgHash = crypto
            .createHash('md5')
            .update(img.buffer)
            .digest('hex');
          // Cache kép: theo file gốc OLE HOẶC theo ảnh hiển thị
          // (phương trình giống hình hệt nhau → cùng LaTeX, không cần AI đọc lại)
          let latex: string | null = null;
          const cachePath = oleHash
            ? path.join(visDir, oleHash + '.tex')
            : null;
          const imgCachePath = path.join(visDir, 'img-' + imgHash + '.tex');
          const readCache = (p: string): string | null => {
            try {
              return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : null;
            } catch {
              return null;
            }
          };
          latex =
            (cachePath && readCache(cachePath)) || readCache(imgCachePath);
          if (!latex) {
            latex = await this.ai.imageToLatex(img.buffer);
            if (latex) {
              try {
                fs.writeFileSync(imgCachePath, latex);
                if (cachePath) fs.writeFileSync(cachePath, latex);
              } catch { /* bỏ qua */ }
              // GHI VÀO KHO HUẤN LUYỆN: cặp (MTEF nhị phân ↔ LaTeX)
              // → sau này đào dữ liệu để mở rộng bộ giải mã MIỄN PHÍ (0 token)
              if (oleHash) {
                try {
                  let known = false;
                  if (fs.existsSync(trainLog)) {
                    known = fs
                      .readFileSync(trainLog, 'utf8')
                      .includes('"' + oleHash + '"');
                  }
                  if (!known) {
                    let oleHex = '';
                    try {
                      const AdmZip2 = require('adm-zip');
                      const zip2 = new AdmZip2(buffer);
                      for (const ref2 of oleRefs) {
                        if (oleHashes.get(ref2.token) !== oleHash) continue;
                        const en2 = ref2.binTarget!.startsWith('word/')
                          ? ref2.binTarget!
                          : 'word/' + ref2.binTarget!.replace(/^\//, '');
                        const e2 = zip2.getEntry(en2);
                        if (e2) {
                          // Lưu phần nhị phân MTEF (stream Equation Native) — dữ liệu
                          // cốt lõi để đào và mở rộng bộ giải mã miễn phí
                          const mtef = mtefFromOle(e2.getData() as Buffer);
                          if (mtef) oleHex = mtef.toString('hex');
                        }
                        break;
                      }
                      console.log('[TRAIN] token=' + ref.token + ' mtefHex=' + oleHex.length);
                    } catch (e: any) {
                      console.log('[TRAIN-ERR] ' + (e?.message || e));
                    }
                    fs.appendFileSync(
                      trainLog,
                      JSON.stringify({
                        ole: oleHash,
                        img: imgHash,
                        latex,
                        mtHex: oleHex,
                        ts: Date.now(),
                      }) + '\n',
                    );
                  }
                } catch { /* bỏ qua */ }
              }
            }
          }
          if (latex) {
            replacements.set(ref.token, '$' + latex + '$');
          }
          count++;
          if (count >= 60) break; // giới hạn số lượt gọi mỗi lần nhập
        }
      }
      const repl = (s: string): string =>
        replacements.size
          ? String(s || '').replace(
              /\[\[(?:OLE|IMG)_\d+\]\]/g,
              (tok) => replacements.get(tok) || tok,
            )
          : String(s || '');
      for (const q of questions) {
        q.content = repl(q.content);
        q.solution = repl(q.solution);
        for (const o of q.options || []) o.text = repl(o.text);
      }
    }

    // Xoá \break / \qquad / \quad trong nội dung, lời giải và lựa chọn
    for (const q of questions) {
      q.content = this.stripSpacingCmds(q.content);
      if (q.solution) q.solution = this.stripSpacingCmds(q.solution);
      for (const o of q.options || []) o.text = this.stripSpacingCmds(o.text);
    }

    // AI phân loại thô từng câu: chủ đề (đúng tên chủ đề đã tạo) + dạng bài + lớp + độ khó
    try {
      const ctx = await this.classificationContext(bank.id);
      const aiResults = await this.ai.classifyQuestionsBatch(
        questions.map((q) => q.content),
        ctx,
      );
      questions.forEach((q, i) => {
        (q as any).ai = {
          grade: aiResults[i]?.grade ?? null,
          topic: this.cleanAiTopic(aiResults[i]?.topic),
          difficulty: aiResults[i]?.difficulty ?? null,
          form: aiResults[i]?.form || '',
        };
      });
    } catch {
      /* bỏ qua nếu AI lỗi — vẫn nhập được */
    }

    // Đánh dấu câu trùng với câu đã có trong kho
    try {
      const dupes = await this.markDuplicates(
        bank.id,
        questions.map((q) => q.content),
      );
      questions.forEach((q, i) => {
        (q as any).duplicateOf = dupes[i] ?? null;
      });
    } catch {
      /* bỏ qua */
    }

    return { count: questions.length, questions, warnings };
  }

  // Xác nhận → lưu câu hỏi vào ngân hàng đề
  async confirmDocxImport(
    teacherId: string,
    data: { questions: any[]; grade?: number; topicName?: string; form?: string },
  ) {
    const bank = await this.getBank(teacherId);

    const diffMap: Record<string, string> = {
      NB: 'NHAN_BIET',
      TH: 'THONG_HIEU',
      VD: 'VAN_DUNG',
      VDC: 'VAN_DUNG_CAO',
    };

    let imported = 0;
    for (const q of data.questions || []) {
      const type = (q.type as QuestionType) || QuestionType.ESSAY;
      const code = await this.generateUniqueCode(type);
      const difficulty = q.difficulty
        ? diffMap[String(q.difficulty).toUpperCase()] || null
        : null;

      // Phân loại THEO TỪNG CÂU: giá trị chỉnh tay trên dòng → gợi ý AI → giá trị chung của modal
      const grade = q.grade ?? q.ai?.grade ?? data.grade ?? null;
      const topicName = this.cleanAiTopic(q.topicName || q.ai?.topic || data.topicName);
      let topicId: string | null = null;
      if (topicName) {
        let topic = await this.prisma.topic.findFirst({
          where: { bankId: bank.id, name: topicName, grade: grade ?? null },
        });
        if (!topic) {
          topic = await this.prisma.topic.create({
            data: { bankId: bank.id, name: topicName, grade },
          });
        }
        topicId = topic.id;
      }
      const form = (q.form || q.ai?.form || data.form || '').trim() || null;

      await this.prisma.question.create({
        data: {
          code,
          bankId: bank.id,
          type,
          content: String(q.content || '').slice(0, 8000),
          options: q.options?.length ? q.options : undefined,
          answer: q.answer ?? undefined,
          solution: q.solution || null,
          grade,
          topicId,
          form,
          difficulty: difficulty as any,
          aiClassified: !!(q.ai && (q.ai.topic || q.ai.form)),
        },
      });
      imported++;
    }
    return { imported };
  }

  // ============ CHỦ ĐỀ ============

  async listTopics(teacherId: string) {
    const bank = await this.getBank(teacherId);
    return this.prisma.topic.findMany({
      where: { bankId: bank.id },
      include: { _count: { select: { questions: true } } },
      orderBy: [{ grade: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    });
  }

  // ===== CÂY MỤC LỤC 3 CẤP (CHƯƠNG → Bài → Dạng) =====
  // Trả về cây topic + đếm số câu (cộng dồn cả cây con) theo lớp
  async getTopicTree(teacherId: string, grade?: number) {
    const bank = await this.getBank(teacherId);
    const topics = await this.prisma.topic.findMany({
      where: { bankId: bank.id, ...(grade ? { grade } : {}) },
      include: { _count: { select: { questions: true } } },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    const byParent = new Map<string | null, any[]>();
    for (const t of topics) {
      const key = t.parentId || null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(t);
    }
    // Sắp xếp tự nhiên: Chương I < II < … < IX, Bài 1 < … < 10, mục lẻ xuống cuối
    byParent.forEach((list) => list.sort(compareTopics));
    const build = (parentId: string | null): any[] =>
      (byParent.get(parentId) || []).map((t) => {
        const children = build(t.id);
        const own = t._count?.questions ?? 0;
        const total = own + children.reduce((s, c) => s + c.count, 0);
        return {
          id: t.id,
          name: t.name,
          grade: t.grade,
          isGroup: t.isGroup,
          parentId: t.parentId,
          order: t.order,
          count: total,
          own,
          children,
        };
      });
    return { tree: build(null) };
  }

  // Seed cây mục lục (CHƯƠNG → Bài → Dạng) cho lớp 10 và/hoặc 11 — idempotent.
  // reset=true: xoá các topic thuộc mục lục của (các) lớp đang seed rồi tạo lại.
  async seedTaxonomy(teacherId: string, reset = false, grade?: number) {
    const bank = await this.getBank(teacherId);

    const taxonomies: { grade: number; chapters: any[] }[] = [];
    if (!grade || grade === 10) {
      taxonomies.push({
        grade: 10,
        chapters: (await import('./grade10-taxonomy')).GRADE10_TAXONOMY,
      });
    }
    if (!grade || grade === 11) {
      taxonomies.push({
        grade: 11,
        chapters: (await import('./grade11-taxonomy')).GRADE11_TAXONOMY,
      });
    }
    if (!grade || grade === 12) {
      taxonomies.push({
        grade: 12,
        chapters: (await import('./grade12-taxonomy')).GRADE12_TAXONOMY,
      });
    }
    const grades = taxonomies.map((t) => t.grade);

    if (reset) {
      const treeTopics = await this.prisma.topic.findMany({
        where: {
          bankId: bank.id,
          grade: { in: grades },
          OR: [{ parentId: { not: null } }, { name: { startsWith: 'CHƯƠNG ' } }],
        },
        select: { id: true },
      });
      if (treeTopics.length) {
        const ids = treeTopics.map((t) => t.id);
        // Gỡ câu hỏi khỏi các topic này trước khi xoá
        await this.prisma.question.updateMany({
          where: { topicId: { in: ids } },
          data: { topicId: null },
        });
        await this.prisma.topic.deleteMany({ where: { id: { in: ids } } });
      }
    }

    let created = 0;
    let updated = 0;
    const upsertTopic = async (
      name: string,
      g: number,
      parentId: string | null,
      order: number,
    ) => {
      const existing = await this.prisma.topic.findFirst({
        where: { bankId: bank.id, name, grade: g, parentId },
      });
      if (existing) {
        if (existing.order !== order) {
          await this.prisma.topic.update({
            where: { id: existing.id },
            data: { order },
          });
          updated++;
        }
        return existing;
      }
      const t = await this.prisma.topic.create({
        data: { bankId: bank.id, name, grade: g, parentId, order },
      });
      created++;
      return t;
    };

    for (const { grade: g, chapters } of taxonomies) {
      for (let ci = 0; ci < chapters.length; ci++) {
        const ch = chapters[ci];
        const chapter = await upsertTopic(ch.name, g, null, ci + 1);
        for (let li = 0; li < ch.lessons.length; li++) {
          const ls = ch.lessons[li];
          const lesson = await upsertTopic(ls.name, g, chapter.id, li + 1);
          for (let fi = 0; fi < ls.forms.length; fi++) {
            await upsertTopic(ls.forms[fi], g, lesson.id, fi + 1);
          }
        }
      }
    }

    // ===== Di chuyển câu hỏi từ các chủ đề CŨ (phẳng) sang CHƯƠNG mới tương ứng =====
    const norm = (s: string) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const STOP = new Set([
      'chuong', 'bai', 'dang', 'va', 'cua', 'trong', 'cac', 'cho', 'voi',
      'mot', 'hai', 'theo', 'tren',
    ]);
    const toks = (s: string) =>
      new Set(
        norm(s)
          .split(' ')
          .filter((w) => w.length > 2 && !STOP.has(w)),
      );
    const overlap = (a: Set<string>, b: Set<string>) => {
      if (!a.size || !b.size) return 0;
      let inter = 0;
      for (const x of a) if (b.has(x)) inter++;
      return inter / Math.min(a.size, b.size);
    };

    let migrated = 0;
    for (const g of grades) {
      const chapters = await this.prisma.topic.findMany({
        where: {
          bankId: bank.id,
          grade: g,
          parentId: null,
          name: { startsWith: 'CHƯƠNG ' },
        },
      });
      const legacy = await this.prisma.topic.findMany({
        where: {
          bankId: bank.id,
          grade: g,
          parentId: null,
          NOT: { name: { startsWith: 'CHƯƠNG ' } },
        },
      });
      for (const old of legacy) {
        const ot = toks(old.name);
        let best: any = null;
        let bestScore = 0;
        for (const ch of chapters) {
          const s = overlap(ot, toks(ch.name));
          if (s > bestScore) {
            bestScore = s;
            best = ch;
          }
        }
        if (!best || bestScore < 0.5) continue;
        const moved = await this.prisma.question.updateMany({
          where: { topicId: old.id },
          data: { topicId: best.id },
        });
        if (moved.count) migrated += moved.count;
        const left = await this.prisma.question.count({
          where: { topicId: old.id },
        });
        if (left === 0) {
          await this.prisma.topic.delete({ where: { id: old.id } });
        }
      }
    }

    return { created, updated, migrated, grades };
  }

  async createTopic(teacherId: string, dto: CreateTopicDto) {
    const bank = await this.getBank(teacherId);
    if (dto.parentId) await this.ensureOwnTopic(teacherId, dto.parentId);
    if (dto.isGroup && dto.parentId) throw new BadRequestException('Nhóm chỉ được tạo ở gốc mục lục');
    return this.prisma.topic.create({
      data: {
        bankId: bank.id,
        name: dto.name,
        grade: dto.isGroup ? null : dto.grade,
        isGroup: !!dto.isGroup,
        parentId: dto.parentId,
      },
    });
  }

  async updateTopic(teacherId: string, topicId: string, dto: UpdateTopicDto) {
    const self = await this.ensureOwnTopic(teacherId, topicId);
    if (dto.parentId && self.isGroup) throw new BadRequestException('Nhóm phải nằm ở gốc mục lục, không chuyển vào mục khác');
    if (dto.parentId) {
      // Thư mục cha phải thuộc kho của mình và KHÔNG được là chính nó / thư mục con của nó
      // (trước đây tạo vòng lặp → cả nhánh mục lục và câu hỏi bên trong biến mất khỏi cây)
      const parent = await this.ensureOwnTopic(teacherId, dto.parentId);
      const sub = await this.topicWithDescendants(parent.bankId, topicId);
      if (sub.includes(dto.parentId)) {
        throw new BadRequestException('Không thể chuyển chủ đề vào chính nó hoặc chủ đề con của nó');
      }
    }
    return this.prisma.topic.update({
      where: { id: topicId },
      data: { ...dto },
    });
  }

  // ===== SẮP XẾP LẠI MỤC LỤC: gợi ý (không đổi dữ liệu) =====
  // 1) Mục trùng tên cùng cấp ("Dạng 2. X" và "Dạng 2: X") → gộp
  // 2) Mục lẻ nằm ở gốc một lớp (không phải chương) → gộp vào mục cùng tên trong cây chuẩn,
  //    hoặc chuyển vào chương gần nghĩa nhất
  async topicTidyPlan(teacherId: string) {
    const bank = await this.getBank(teacherId);
    const all = await this.prisma.topic.findMany({
      where: { bankId: bank.id },
      include: { _count: { select: { questions: true, children: true } } },
    });
    // Nhóm tự đặt tên và mọi mục bên trong do giáo viên chủ ý xếp → không đụng tới
    const inGroup = new Set<string>();
    const mark = (id: string) => {
      inGroup.add(id);
      all.filter((x) => x.parentId === id).forEach((x) => mark(x.id));
    };
    all.filter((x) => x.isGroup).forEach((x) => mark(x.id));
    const topics = all.filter((x) => !inGroup.has(x.id));
    const byId = new Map(topics.map((t) => [t.id, t]));
    const pathOf = (id: string | null): string => {
      const names: string[] = [];
      let cur = id ? byId.get(id) : undefined;
      let guard = 0;
      while (cur && guard++ < 10) {
        names.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return names.join(' › ');
    };
    const brief = (t: any) => ({
      id: t.id,
      name: t.name,
      grade: t.grade,
      path: pathOf(t.id),
      questions: t._count.questions,
      children: t._count.children,
    });
    const actions: any[] = [];
    const used = new Set<string>();

    // 1) Trùng tên cùng cấp
    const groups = new Map<string, any[]>();
    for (const t of topics) {
      const k = `${t.parentId || 'root'}|${t.grade ?? ''}|${fullKey(t.name)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    }
    groups.forEach((list) => {
      if (list.length < 2) return;
      // Giữ mục có nhiều con / nhiều câu nhất (thường là mục của cây chuẩn)
      list.sort(
        (a, b) =>
          b._count.children - a._count.children ||
          b._count.questions - a._count.questions ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const keep = list[0];
      for (const t of list.slice(1)) {
        used.add(t.id);
        actions.push({
          kind: 'merge',
          reason: 'Trùng tên với mục cùng cấp',
          from: brief(t),
          into: brief(keep),
          gradeChange: null,
        });
      }
    });

    // 2) Mục lẻ ở gốc
    const nonRoot = topics.filter((t) => t.parentId);
    for (const t of topics) {
      if (t.parentId || used.has(t.id) || isChapterName(t.name)) continue;
      const key = coreKey(t.name);
      // Trùng tên lõi (bỏ nhãn/dấu) → khớp chắc; không thì tên gần giống ≥ 70% với một mục lá
      const same = nonRoot
        .filter((x) => x.id !== t.id && key && coreKey(x.name) === key)
        .sort((a, b) => (a.grade === t.grade ? -1 : 0) - (b.grade === t.grade ? -1 : 0));
      if (!same.length && t._count.children === 0) {
        const near = nonRoot
          .filter((x) => x.id !== t.id && x._count.children === 0)
          .map((x) => ({ x, sc: tokenScore(t.name, x.name) + (x.grade === t.grade ? 0.05 : 0) }))
          .filter((r) => r.sc >= 0.7)
          .sort((a, b) => b.sc - a.sc);
        if (near.length) same.push(near[0].x);
      }
      if (same.length) {
        const into = same[0];
        actions.push({
          kind: 'merge',
          reason: 'Đã có mục cùng (hoặc gần cùng) tên trong mục lục',
          from: brief(t),
          into: brief(into),
          gradeChange: into.grade !== t.grade ? { from: t.grade, to: into.grade } : null,
        });
        continue;
      }
      // Chương cùng lớp có nội dung (tên chương + tên con cháu) gần nghĩa nhất
      const chapters = topics.filter((c) => !c.parentId && c.grade === t.grade && isChapterName(c.name));
      let best: any = null;
      let bestScore = 0;
      for (const c of chapters) {
        const desc = nonRoot.filter((x) => pathOf(x.id).startsWith(c.name));
        const score = Math.max(tokenScore(t.name, c.name), ...desc.map((d) => tokenScore(t.name, d.name)), 0);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      actions.push(
        best && bestScore >= 0.25
          ? { kind: 'move', reason: 'Mục lẻ — gợi ý chương gần nghĩa nhất', from: brief(t), into: brief(best), gradeChange: null }
          : { kind: 'manual', reason: 'Mục lẻ — chưa tìm được chương phù hợp, hãy chọn tay', from: brief(t), into: null, gradeChange: null },
      );
    }
    return { actions };
  }

  // ===== SẮP XẾP LẠI MỤC LỤC: áp dụng các thao tác GV đã duyệt =====
  async topicTidyApply(teacherId: string, body: any) {
    const bank = await this.getBank(teacherId);
    const list: any[] = Array.isArray(body?.actions) ? body.actions.slice(0, 300) : [];
    let merged = 0;
    let moved = 0;
    let questions = 0;
    for (const a of list) {
      const fromId = String(a?.fromId || '');
      const intoId = String(a?.intoId || '');
      if (!fromId || !intoId || fromId === intoId) continue;
      const [from, into] = await Promise.all([
        this.prisma.topic.findFirst({ where: { id: fromId, bankId: bank.id } }),
        this.prisma.topic.findFirst({ where: { id: intoId, bankId: bank.id } }),
      ]);
      if (!from || !into) continue; // đã bị gộp/xoá ở thao tác trước
      if (from.isGroup) continue; // không gộp/chuyển nhóm
      const sub = await this.topicWithDescendants(bank.id, fromId);
      if (sub.includes(intoId)) {
        throw new BadRequestException(`Không thể đưa "${from.name}" vào chính mục con của nó`);
      }
      if (a.kind === 'merge') {
        // Câu hỏi + đề + mục con của "from" chuyển sang "into", rồi xoá "from"
        const r = await this.prisma.$transaction(async (tx) => {
          const q = await tx.question.updateMany({
            where: { topicId: fromId },
            data: { topicId: intoId, ...(into.grade !== from.grade && into.grade ? { grade: into.grade } : {}) },
          });
          await tx.exam.updateMany({ where: { topicId: fromId }, data: { topicId: intoId } });
          await tx.topic.updateMany({ where: { parentId: fromId }, data: { parentId: intoId } });
          await tx.topic.delete({ where: { id: fromId } });
          return q.count;
        });
        merged++;
        questions += r;
      } else {
        await this.prisma.topic.update({
          where: { id: fromId },
          data: { parentId: intoId, ...(into.grade ? { grade: into.grade } : {}) },
        });
        moved++;
      }
    }
    return { merged, moved, questions };
  }

  async removeTopic(teacherId: string, topicId: string) {
    await this.ensureOwnTopic(teacherId, topicId);
    return this.prisma.topic.delete({ where: { id: topicId } });
  }

  // ============ CÂU HỎI ============

  async listQuestions(teacherId: string, query: any) {
    const bank = await this.getBank(teacherId);
    const where: any = { bankId: bank.id };
    if (query.type) where.type = query.type;
    if (query.grade) where.grade = Number(query.grade);
    if (query.topicId) where.topicId = query.topicId;
    if (query.form) where.form = query.form;
    if (query.source) where.source = query.source;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.q) where.content = { contains: query.q };
    if (query.code) {
      // Tìm theo ID/mã câu hỏi (vd: A398335) — khớp CHÍNH XÁC, không phân biệt hoa thường
      where.code = {
        equals: String(query.code).toUpperCase(),
        mode: 'insensitive',
      };
    }
    if (query.ids) {
      const ids = String(query.ids).split(',').filter(Boolean).slice(0, 200);
      if (ids.length) where.id = { in: ids };
    }

    return this.prisma.question.findMany({
      where,
      include: { topic: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 100,
      skip: query.skip ? Number(query.skip) : 0,
    });
  }

  // Danh sách dạng toán (phân loại theo dạng) + số câu mỗi dạng
  // Gộp: dạng đã ĐĂNG KÝ (BankForm) + dạng phát sinh từ câu hỏi
  async listForms(teacherId: string) {
    const bank = await this.getBank(teacherId);
    const questions = await this.prisma.question.findMany({
      where: { bankId: bank.id, form: { not: null } },
      select: { form: true, grade: true },
    });
    const registered = await this.prisma.bankForm.findMany({
      where: { bankId: bank.id },
      select: { name: true },
    });
    const counts = new Map<string, number>();
    const byGrade = new Map<string, Record<string, number>>();
    for (const f of registered) {
      const n = f.name.trim();
      if (n && !counts.has(n)) {
        counts.set(n, 0);
        byGrade.set(n, {});
      }
    }
    for (const q of questions) {
      const f = (q.form || '').trim();
      if (!f) continue;
      counts.set(f, (counts.get(f) || 0) + 1);
      const g = q.grade ? `L${q.grade}` : 'Khác';
      const m = byGrade.get(f) || {};
      m[g] = (m[g] || 0) + 1;
      byGrade.set(f, m);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count, byGrade: byGrade.get(name) || {} }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }

  // Đăng ký dạng toán mới (hiển thị trong bộ lọc kể cả khi chưa có câu hỏi)
  async addForm(teacherId: string, name: string) {
    const bank = await this.getBank(teacherId);
    const clean = String(name || '').trim();
    if (!clean) throw new BadRequestException('Tên dạng toán không được trống');
    return this.prisma.bankForm.upsert({
      where: { bankId_name: { bankId: bank.id, name: clean } },
      update: {},
      create: { bankId: bank.id, name: clean },
    });
  }

  // Đổi tên dạng bài → tự cập nhật MỌI câu hỏi liên quan
  async renameForm(teacherId: string, oldName: string, newName: string) {
    const bank = await this.getBank(teacherId);
    const old = String(oldName || '').trim();
    const next = String(newName || '').trim().slice(0, 120);
    if (!old || !next) throw new BadRequestException('Tên dạng bài không hợp lệ');
    if (old === next) return { renamed: true, name: next };
    await this.prisma.question.updateMany({
      where: { bankId: bank.id, form: old },
      data: { form: next },
    });
    await this.prisma.bankForm.upsert({
      where: { bankId_name: { bankId: bank.id, name: next } },
      update: {},
      create: { bankId: bank.id, name: next },
    });
    await this.prisma.bankForm.deleteMany({
      where: { bankId: bank.id, name: old },
    });
    return { renamed: true, name: next };
  }

  // Gộp 2 dạng bài trùng nhau: câu của dạng bỏ → dạng giữ
  async mergeForms(teacherId: string, keep: string, drop: string) {
    const bank = await this.getBank(teacherId);
    const keepName = String(keep || '').trim();
    const dropName = String(drop || '').trim();
    if (!keepName || !dropName) throw new BadRequestException('Tên dạng bài không hợp lệ');
    if (keepName === dropName) throw new BadRequestException('Hai dạng bài phải khác nhau');
    const n = await this.prisma.question.updateMany({
      where: { bankId: bank.id, form: dropName },
      data: { form: keepName },
    });
    await this.prisma.bankForm.upsert({
      where: { bankId_name: { bankId: bank.id, name: keepName } },
      update: {},
      create: { bankId: bank.id, name: keepName },
    });
    await this.prisma.bankForm.deleteMany({
      where: { bankId: bank.id, name: dropName },
    });
    return { merged: true, movedQuestions: n.count };
  }

  // Xóa dạng bài: câu hỏi giữ nguyên, chuyển về "Không dạng bài"
  async deleteForm(teacherId: string, name: string) {
    const bank = await this.getBank(teacherId);
    const clean = String(name || '').trim();
    if (!clean) throw new BadRequestException('Tên dạng bài không hợp lệ');
    await this.prisma.question.updateMany({
      where: { bankId: bank.id, form: clean },
      data: { form: null },
    });
    await this.prisma.bankForm.deleteMany({
      where: { bankId: bank.id, name: clean },
    });
    return { removed: true, name: clean };
  }

  // Dạng bài + số câu THEO BỘ LỌC lớp/chủ đề (cho trình tạo đề nhanh theo dạng)
  async listFormsByFilter(teacherId: string, query: any) {
    const bank = await this.getBank(teacherId);
    const where: any = { bankId: bank.id, form: { not: null } };
    if (query?.grade) where.grade = Number(query.grade);
    {
      // Bao gồm cả topic con/cháu (chọn Chương/Bài hoặc nhiều chủ đề vẫn ra đủ dạng)
      const roots = this.readTopicIds(query);
      if (roots.length) {
        const ids = await this.topicWithDescendants(bank.id, roots);
        where.topicId = { in: ids };
      }
    }
    const qs = await this.prisma.question.findMany({
      where,
      select: { form: true },
    });
    const counts = new Map<string, number>();
    for (const q of qs) {
      const f = (q.form || '').trim();
      if (f) counts.set(f, (counts.get(f) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }

  // Gợi ý gộp các dạng bài gần giống nhau (so khớp chuẩn hóa tên — miễn phí, không tốn AI)
  async suggestFormMerges(teacherId: string) {    const bank = await this.getBank(teacherId);
    const forms = await this.listForms(teacherId);
    const names = forms.map((f) => f.name);
    const normalize = (s: string) => {
      return Array.from(
        new Set(
          s
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9đ ]/g, ' ')
            .split(/\s+/)
            .filter((w) => w && w.length > 1 && !['cua', 'cho', 'va', 'cac', 'la', 'voi', 'tren'].includes(w)),
        ),
      );
    };
    const tokens = names.map((n) => ({ n, t: normalize(n) }));
    const suggestions: { keep: string; drop: string; keepCount: number; dropCount: number }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const a = tokens[i];
        const b = tokens[j];
        if (!a.t.length || !b.t.length) continue;
        const inter = a.t.filter((w) => b.t.includes(w)).length;
        const union = new Set([...a.t, ...b.t]).size;
        const jaccard = inter / union;
        const contain = a.t.every((w) => b.t.includes(w)) || b.t.every((w) => a.t.includes(w));
        if (jaccard >= 0.75 || (contain && jaccard >= 0.5)) {
          const keep = a.n.length <= b.n.length ? a.n : b.n;
          const drop = keep === a.n ? b.n : a.n;
          const keepCount = forms.find((f) => f.name === keep)?.count ?? 0;
          const dropCount = forms.find((f) => f.name === drop)?.count ?? 0;
          suggestions.push({ keep, drop, keepCount, dropCount });
        }
      }
    }
    return suggestions.slice(0, 30);
  }

  // Danh sách nguồn đề (Trường/Sở/Đề HKI/Đề HSG...) + số câu mỗi nguồn
  async listSources(teacherId: string) {
    const bank = await this.getBank(teacherId);
    const questions = await this.prisma.question.findMany({
      where: { bankId: bank.id, source: { not: null } },
      select: { source: true },
    });
    const registered = await this.prisma.bankSource.findMany({
      where: { bankId: bank.id },
      select: { name: true },
    });
    const counts = new Map<string, number>();
    for (const r of registered) {
      const n = r.name.trim();
      if (n && !counts.has(n)) counts.set(n, 0);
    }
    for (const q of questions) {
      const s = (q.source || '').trim();
      if (s) counts.set(s, (counts.get(s) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'vi'));
  }

  // Đăng ký nguồn đề mới
  async addSource(teacherId: string, name: string) {
    const bank = await this.getBank(teacherId);
    const clean = String(name || '').trim();
    if (!clean) throw new BadRequestException('Tên nguồn đề không được trống');
    return this.prisma.bankSource.upsert({
      where: { bankId_name: { bankId: bank.id, name: clean } },
      update: {},
      create: { bankId: bank.id, name: clean },
    });
  }

  // Xóa nguồn đề khỏi danh sách phân loại (câu hỏi giữ nguyên, chuyển về không phân loại)
  async removeSource(teacherId: string, name: string) {
    const bank = await this.getBank(teacherId);
    const clean = String(name || '').trim();
    if (!clean) throw new BadRequestException('Tên nguồn đề không hợp lệ');
    await this.prisma.bankSource.deleteMany({
      where: { bankId: bank.id, name: clean },
    });
    await this.prisma.question.updateMany({
      where: { bankId: bank.id, source: clean },
      data: { source: null },
    });
    return { removed: true, name: clean };
  }

  // Tổng quan ngân hàng: tổng câu + theo loại/lớp/độ khó + số chủ đề + số dạng toán
  async bankSummary(teacherId: string) {
    const bank = await this.getBank(teacherId);
    const total = await this.prisma.question.count({
      where: { bankId: bank.id },
    });
    const byType = await this.prisma.question.groupBy({
      by: ['type'],
      where: { bankId: bank.id },
      _count: { _all: true },
    });
    const byGrade = await this.prisma.question.groupBy({
      by: ['grade'],
      where: { bankId: bank.id },
      _count: { _all: true },
    });
    const byDifficulty = await this.prisma.question.groupBy({
      by: ['difficulty'],
      where: { bankId: bank.id },
      _count: { _all: true },
    });
    const topicCount = await this.prisma.topic.count({
      where: { bankId: bank.id },
    });
    const formCount = await this.prisma.question.findMany({
      where: { bankId: bank.id, form: { not: null } },
      select: { form: true },
      distinct: ['form'],
    });
    const byTypeMap: Record<string, number> = {};
    for (const t of byType) byTypeMap[t.type] = t._count._all;
    const byGradeMap: Record<string, number> = {};
    for (const g of byGrade) byGradeMap[String(g.grade ?? 'none')] = g._count._all;
    const byDiffMap: Record<string, number> = {};
    for (const d of byDifficulty)
      byDiffMap[d.difficulty ?? 'none'] = d._count._all;
    return {
      total,
      byType: byTypeMap,
      byGrade: byGradeMap,
      byDifficulty: byDiffMap,
      topics: topicCount,
      forms: formCount.length,
    };
  }

  // Bảng thống kê LOẠI CÂU × MỨC ĐỘ cho đúng phạm vi đang xem (khối / thư mục gồm thư mục con)
  async bankMatrix(teacherId: string, query: any) {
    const bank = await this.getBank(teacherId);
    const where: any = { bankId: bank.id };
    if (query?.grade === 'none') where.grade = null;
    else if (query?.grade && Number.isFinite(Number(query.grade))) where.grade = Number(query.grade);
    const roots = this.readTopicIds(query);
    if (roots.length) where.topicId = { in: await this.topicWithDescendants(bank.id, roots) };
    const rows = await this.prisma.question.groupBy({
      by: ['type', 'difficulty'],
      where,
      _count: { _all: true },
    });
    const matrix: Record<string, Record<string, number>> = {};
    let total = 0;
    for (const r of rows) {
      const t = String(r.type);
      const d = String(r.difficulty ?? 'none');
      matrix[t] = matrix[t] || {};
      matrix[t][d] = (matrix[t][d] || 0) + r._count._all;
      total += r._count._all;
    }
    return { matrix, total };
  }

  async createQuestion(teacherId: string, dto: CreateQuestionDto) {
    const bank = await this.getBank(teacherId);
    const code = await this.generateUniqueCode(dto.type);
    const cleanContent = this.stripSpacingCmds(dto.content);
    const cleanSolution = this.stripSpacingCmds(dto.solution);

    // Xử lý chủ đề: nếu gửi topicName thì tìm hoặc tạo Topic
    let topicId: string | undefined = dto.topicId;
    if (topicId) await this.ensureOwnTopic(teacherId, topicId);
    if (!topicId && (dto as any).topicName) {
      const name = (dto as any).topicName.trim();
      let topic = await this.prisma.topic.findFirst({
        where: { bankId: bank.id, name, grade: dto.grade ?? null },
      });
      if (!topic) {
        topic = await this.prisma.topic.create({
          data: { bankId: bank.id, name, grade: dto.grade },
        });
      }
      topicId = topic.id;
    }

    const question = await this.prisma.question.create({
      data: {
        code,
        bankId: bank.id,
        type: dto.type,
        content: cleanContent,
        options: dto.options ?? null,
        answer: dto.answer,
        solution: cleanSolution,
        grade: dto.grade,
        topicId,
        form: (dto as any).form?.trim() || null,
        source: (dto as any).source?.trim() || null,
        difficulty: dto.difficulty,
        texSource: dto.texSource,
      },
    });

    // Biên dịch sẵn hình TikZ ngay khi lưu → người dùng sau chỉ lấy ảnh từ cache
    this.precompileTikz(dto.content, dto.solution);
    return question;
  }

  // Biên dịch sẵn các block tikz (không chặn lưu câu hỏi)
  private tikzQueue: Promise<any> = Promise.resolve();
  private precompileTikz(...texts: (string | undefined | null)[]) {
    const blocks = texts.flatMap((t) => extractTikzBlocks(t || '')).slice(0, 10);
    if (!blocks.length) return;
    // Nối đuôi để biên dịch TUẦN TỰ (không đổ ồ ạt pdflatex gây hết RAM khi nhập nhiều câu)
    this.tikzQueue = this.tikzQueue
      .then(() =>
        Promise.all(blocks.map((b) => this.examsService.compileTikzSnippet(b).catch(() => {}))),
      )
      .catch(() => {});
  }

  async getQuestion(teacherId: string, id: string) {
    const bank = await this.getBank(teacherId);
    const question = await this.prisma.question.findFirst({
      where: { id, bankId: bank.id },
      include: { topic: true },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    return question;
  }

  async updateQuestion(teacherId: string, id: string, dto: UpdateQuestionDto) {
    const bank = await this.getBank(teacherId);
    const question = await this.prisma.question.findFirst({
      where: { id, bankId: bank.id },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');

    // Xử lý chủ đề: gửi topicName (text) → tìm hoặc tạo Topic, CHUYỂN câu hỏi sang thư mục đó
    const data: any = { ...dto };
    if (dto.topicId) await this.ensureOwnTopic(teacherId, dto.topicId);
    // Xoá \break / \qquad / \quad nếu có cập nhật nội dung/lời giải
    if (data.content !== undefined) data.content = this.stripSpacingCmds(data.content);
    if (data.solution !== undefined) data.solution = this.stripSpacingCmds(data.solution);
    const topicName: string = ((dto as any).topicName || '').trim();
    if (topicName) {
      const grade = dto.grade !== undefined ? dto.grade : question.grade;
      let topic = await this.prisma.topic.findFirst({
        where: { bankId: bank.id, name: topicName, grade: grade ?? null },
      });
      if (!topic) {
        topic = await this.prisma.topic.create({
          data: { bankId: bank.id, name: topicName, grade },
        });
      }
      data.topicId = topic.id;
    }
    delete data.topicName;

    const updated = await this.prisma.question.update({
      where: { id },
      data,
    });
    // Cập nhật nội dung → biên dịch lại các hình tikz mới
    this.precompileTikz(dto.content, dto.solution);
    return updated;
  }

  // Tìm câu "sống" cùng nội dung với câu sắp xóa (để chuyển liên kết đề thi/bài tập sang)
  private async findSurvivor(
    bankId: string,
    questionId: string,
    deletingIds: string[],
  ): Promise<string | null> {
    const q = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!q) return null;
    const n = this.normalizeQuestion(q.content);
    if (!n) return null;
    const candidates = await this.prisma.question.findMany({
      where: { bankId, id: { notIn: deletingIds } },
      select: { id: true, content: true },
    });
    // CHỈ chuyển đề thi sang câu có nội dung TRÙNG TUYỆT ĐỐI. Trước đây nhận cả câu
    // "gần giống" (88%) → xoá 1 câu có thể làm đề thi lặng lẽ đổi sang câu khác số liệu/đáp án.
    const match = candidates.find((c) => this.normalizeQuestion(c.content) === n);
    return match?.id ?? null;
  }

  // Chuyển liên kết đề thi của câu bị xóa sang câu sống cùng nội dung.
  // Nếu KHÔNG còn câu nào cùng nội dung (xóa hết cả 2) → mới gỡ khỏi đề thi.
  private async relinkOrRemoveLinks(
    tx: any,
    questionId: string,
    survivorId: string | null,
  ): Promise<{ examItems: number }> {
    if (survivorId) {
      const items = await tx.examItem.findMany({ where: { questionId } });
      let kept = 0;
      for (const it of items) {
        const clash = await tx.examItem.findFirst({
          where: { examId: it.examId, questionId: survivorId },
        });
        if (clash) {
          await tx.examItem.delete({ where: { id: it.id } }); // đề đã có câu sống → bỏ bản trùng
        } else {
          await tx.examItem.update({
            where: { id: it.id },
            data: { questionId: survivorId },
          });
          kept++;
        }
      }
      return { examItems: kept };
    }
    // Không còn câu cùng nội dung → gỡ khỏi đề thi (hành vi cũ)
    const examItems = await tx.examItem.count({ where: { questionId } });
    await tx.examItem.deleteMany({ where: { questionId } });
    return { examItems };
  }

  async removeQuestion(teacherId: string, id: string) {
    const bank = await this.getBank(teacherId);
    const question = await this.prisma.question.findFirst({
      where: { id, bankId: bank.id },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    let removed = { examItems: 0 };
    await this.prisma.$transaction(async (tx) => {
      const survivor = await this.findSurvivor(bank.id, id, [id]);
      removed = await this.relinkOrRemoveLinks(tx, id, survivor);
      await tx.question.delete({ where: { id } });
    });
    return {
      deleted: true,
      removed,
      message: `Đã xóa câu hỏi${removed.examItems ? ` — chuyển ${removed.examItems} đề thi sang dùng câu cùng nội dung` : ''}.`,
    };
  }

  // Xóa NHIỀU câu hỏi đã chọn cùng lúc
  async removeQuestions(teacherId: string, ids: string[]) {
    const bank = await this.getBank(teacherId);
    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!cleanIds.length) {
      throw new BadRequestException('Chưa chọn câu hỏi nào để xóa');
    }
    const owned = await this.prisma.question.findMany({
      where: { id: { in: cleanIds }, bankId: bank.id },
      select: { id: true },
    });
    const ownedIds = owned.map((q) => q.id);
    if (!ownedIds.length) throw new NotFoundException('Không tìm thấy câu hỏi nào hợp lệ');

    // Tìm "câu sống" cho từng câu TRƯỚC khi mở transaction (đọc cả kho 1 lần) —
    // trước đây đọc lại cả kho cho mỗi câu bên trong transaction → xoá nhiều câu bị quá
    // thời gian 5 giây mặc định của Prisma và thất bại.
    const others = await this.prisma.question.findMany({
      where: { bankId: bank.id, id: { notIn: ownedIds } },
      select: { id: true, content: true },
    });
    const byNorm = new Map<string, string>();
    for (const o of others) {
      const k = this.normalizeQuestion(o.content);
      if (k && !byNorm.has(k)) byNorm.set(k, o.id);
    }
    const deleting = await this.prisma.question.findMany({
      where: { id: { in: ownedIds } },
      select: { id: true, content: true },
    });
    const survivorOf = new Map<string, string | null>(
      deleting.map((q) => [q.id, byNorm.get(this.normalizeQuestion(q.content)) ?? null]),
    );

    let examItems = 0;
    await this.prisma.$transaction(
      async (tx) => {
        for (const id of ownedIds) {
          const r = await this.relinkOrRemoveLinks(tx, id, survivorOf.get(id) ?? null);
          examItems += r.examItems;
          await tx.question.delete({ where: { id } });
        }
      },
      { timeout: 120000, maxWait: 10000 },
    );

    return {
      deleted: ownedIds.length,
      removed: { examItems },
      message: `Đã xóa ${ownedIds.length} câu hỏi${examItems ? ` — ${examItems} đề thi chuyển sang dùng câu cùng nội dung` : ''}.`,
    };
  }

  // Danh sách câu hỏi CÓ PHÂN TRANG + SẮP XẾP (cho toolbar ngân hàng đề)
  // Trả về [id, …tất cả con/cháu] của MỘT HOẶC NHIỀU topic — lọc câu hỏi theo cả CÂY mục lục
  private async topicWithDescendants(
    bankId: string,
    topicId: string | string[],
  ): Promise<string[]> {
    const roots = (Array.isArray(topicId) ? topicId : [topicId])
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    if (!roots.length) return [];
    const all = await this.prisma.topic.findMany({
      where: { bankId },
      select: { id: true, parentId: true },
    });
    const childrenOf = new Map<string, string[]>();
    for (const t of all) {
      if (t.parentId) {
        if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
        childrenOf.get(t.parentId)!.push(t.id);
      }
    }
    const out: string[] = [];
    const seen = new Set<string>();
    const stack: string[] = [...roots];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      for (const c of childrenOf.get(id) || []) stack.push(c);
    }
    return out;
  }

  // Đọc tham số chủ đề (hỗ trợ cả `topicIds` nhiều giá trị và `topicId` cũ)
  private readTopicIds(query: any): string[] {
    const raw: string[] = [];
    const multi = String(query?.topicIds || '');
    if (multi) raw.push(...multi.split(','));
    if (query?.topicId) raw.push(String(query.topicId));
    return Array.from(new Set(raw.map((s) => s.trim()).filter(Boolean)));
  }

  async listQuestionsPaged(teacherId: string, query: any) {
    const bank = await this.getBank(teacherId);
    const where: any = { bankId: bank.id };
    if (query.type) where.type = query.type;
    if (query.grade) where.grade = Number(query.grade);
    {
      // Chọn CHƯƠNG/Bài (hoặc NHIỀU chủ đề) phải bao gồm cả các Dạng con bên trong
      const roots = this.readTopicIds(query);
      if (roots.length) {
        const ids = await this.topicWithDescendants(bank.id, roots);
        where.topicId = { in: ids };
      }
    }
    if (query.form) where.form = query.form;
    if (query.source) where.source = query.source;
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.code) {
      // Tìm theo mã câu: gõ 1 phần đầu (vd "A1") ra mọi câu có mã BẮT ĐẦU bằng "A1"
      where.code = {
        startsWith: String(query.code).trim().toUpperCase(),
        mode: 'insensitive',
      };
    }
    if (query.q && String(query.q).trim()) {
      // Tìm theo nội dung, HIỂU LaTeX: bỏ dấu tiếng Việt, khoảng trắng, $, {}, \left/\right,
      // \dfrac≡\frac… rồi khớp TỪNG cụm từ khoá → "x^2 + 1" tìm được "$x^{2}+1$"
      const ids = await this.searchContentIds(where, String(query.q));
      where.id = { in: ids };
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const sortMap: Record<string, any> = {
      newest: { createdAt: 'desc' },
      oldest: { createdAt: 'asc' },
      code: { code: 'asc' },
      difficulty: { difficulty: 'asc' },
      form: [{ form: 'asc' }, { createdAt: 'desc' }],
      topic: [{ topicId: 'asc' }, { createdAt: 'desc' }],
    };
    const orderBy = sortMap[String(query.sort || 'newest')] || sortMap.newest;

    const [items, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        include: { topic: true },
        orderBy,
        take: limit,
        skip: (page - 1) * limit,
      }),
      this.prisma.question.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // Chuẩn hoá để TÌM KIẾM (khác chuẩn hoá chống trùng): bỏ hết khoảng trắng và ký hiệu
  // định dạng LaTeX để cách gõ khác nhau vẫn khớp nhau
  private searchNorm(s: string): string {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/\\[dt]frac(?![a-z])/g, '\\frac')
      .replace(/\\(?:left|right|displaystyle|limits|nolimits|mathrm|text|textit|textbf|quad|qquad)(?![a-z])/g, '')
      .replace(/\\[,;:! ]/g, '')
      .replace(/\\[()\[\]]/g, '')
      .replace(/[\s${}\\]/g, '');
  }

  private async searchContentIds(where: any, raw: string): Promise<string[]> {
    const tokens = raw
      .trim()
      .split(/\s+/)
      .map((t) => this.searchNorm(t))
      .filter(Boolean);
    if (!tokens.length) return [];
    const whole = this.searchNorm(raw);
    const rows = await this.prisma.question.findMany({
      where,
      select: { id: true, content: true, options: true, solution: true },
    });
    const hits: { id: string; rank: number }[] = [];
    for (const r of rows) {
      const opts = Array.isArray(r.options)
        ? (r.options as any[]).map((o) => (o && o.text) || '').join(' ')
        : '';
      const main = this.searchNorm(r.content + ' ' + opts);
      const sol = this.searchNorm(r.solution || '');
      if (tokens.every((t) => main.includes(t))) {
        hits.push({ id: r.id, rank: main.includes(whole) ? 0 : 1 });
      } else if (tokens.every((t) => main.includes(t) || sol.includes(t))) {
        hits.push({ id: r.id, rank: 2 }); // khớp nhờ lời giải → xếp sau
      }
    }
    hits.sort((a, b) => a.rank - b.rank);
    return hits.slice(0, 5000).map((h) => h.id);
  }

  // Xuất các câu hỏi đã chọn ra .docx (0 token AI)
  async exportQuestionsDocx(
    teacherId: string,
    ids: string[],
    withAnswers: boolean,
    mathMode: 'omml' | 'tex' = 'omml',
  ) {
    const bank = await this.getBank(teacherId);
    const list = await this.prisma.question.findMany({
      where: { bankId: bank.id, id: { in: (ids || []).slice(0, 200) } },
      orderBy: { code: 'asc' },
    });
    if (!list.length) throw new BadRequestException('Chưa chọn câu hỏi nào');
    const { buildExamDocx } = await import('../common/docx.helper');
    const items = list.map((q: any, i: number) => ({
      order: i + 1,
      part: 1,
      score: 0.25,
      type: q.type,
      content: q.content,
      options: (q.options as any) || null,
      answer: q.answer,
      solution: q.solution,
    }));
    const buffer = await buildExamDocx({
      title: 'NGÂN HÀNG CÂU HỎI',
      duration: 0,
      items,
      withAnswers,
      mathMode,
    });
    const suffix = mathMode === 'tex' ? '-tex' : '';
    const filename = `ngan-hang-cau-hoi${withAnswers ? '-dapan' : ''}${suffix}.docx`;
    return { buffer, filename };
  }

  // ============ PHIẾU HỌC TẬP THEO DẠNG BÀI ============

  async exportWorksheetDocx(teacherId: string, body: any) {
    return this.exportWorksheet(teacherId, { ...body, format: 'docx' });
  }

  // Xuất phiếu học tập theo dạng bài — hỗ trợ docx / tex / pdf
  async exportWorksheet(teacherId: string, body: any) {
    const bank = await this.getBank(teacherId);
    const form = String(body?.form || '').trim();
    if (!form) throw new BadRequestException('Chưa chọn dạng bài');
    const count = Math.min(50, Math.max(1, Number(body?.count) || 10));
    const where: any = { bankId: bank.id, form };
    if (body?.grade) where.grade = Number(body.grade);
    if (body?.topicId) where.topicId = String(body.topicId);

    let pool = await this.prisma.question.findMany({
      where,
      include: { topic: true },
    });
    if (!pool.length) {
      throw new BadRequestException(
        `Chưa có câu hỏi nào thuộc dạng bài "${form}" trong bộ lọc này`,
      );
    }
    // Bản A/B: xáo trộn theo phiên bản → mỗi học sinh một phiếu khác nhau
    const seedStr = String(body?.version || 'A');
    let seed = 0;
    for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    pool = [...pool];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Độ khó TĂNG DẦN: Nhận biết → Thông hiểu → Vận dụng → VDC
    const diffOrder: Record<string, number> = {
      NHAN_BIET: 0,
      THONG_HIEU: 1,
      VAN_DUNG: 2,
      VAN_DUNG_CAO: 3,
    };
    const picked = pool
      .slice(0, count)
      .sort(
        (a, b) =>
          (diffOrder[a.difficulty || ''] ?? 99) - (diffOrder[b.difficulty || ''] ?? 99),
      );

    const gradeText = body?.grade ? ` — Lớp ${body.grade}` : '';
    const topicText = picked[0]?.topic?.name ? ` · ${(picked[0] as any).topic.name}` : '';
    const title = `PHIẾU LUYỆN TẬP: ${form.toUpperCase()}${gradeText}${topicText}`;
    const withAnswers = !!body?.withAnswers;
    const baseName = `Phieu-luyen-tap-${form.replace(/[^a-zA-Z0-9đĐ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 60)}`;
    const ver = String(body?.version || 'A').replace(/[^A-Za-z0-9]/g, '');
    const safeBase = baseName + (ver ? '-' + ver : '');

    const items = picked.map((q: any, i: number) => ({
      order: i + 1,
      part: 1,
      score: 0.25,
      type: q.type,
      content: q.content,
      options: (q.options as any) || null,
      answer: q.answer,
      solution: withAnswers ? q.solution : null,
    }));
    // generateTex dùng cấu trúc item.question.{...}
    const texItems = picked.map((q: any, i: number) => ({
      order: i + 1,
      part: 1,
      question: {
        type: q.type,
        content: q.content,
        options: (q.options as any) || null,
        answer: q.answer,
        solution: withAnswers ? q.solution : null,
      },
    }));

    const format = String(body?.format || 'docx').toLowerCase();
    if (format === 'tex') {
      const tex = this.examsService.worksheetTex(title, texItems);
      return {
        buffer: Buffer.from(tex, 'utf8'),
        filename: `${safeBase}${withAnswers ? '-dapan' : ''}.tex`,
        contentType: 'application/x-tex',
      };
    }
    if (format === 'pdf') {
      const tex = this.examsService.worksheetTex(title, texItems);
      const pdf = await this.examsService.compileRaw(tex);
      return {
        buffer: pdf,
        filename: `${safeBase}${withAnswers ? '-dapan' : ''}.pdf`,
        contentType: 'application/pdf',
      };
    }

    const { buildExamDocx } = await import('../common/docx.helper');
    const buffer = await buildExamDocx({
      title,
      duration: 0,
      items,
      withAnswers,
      mathMode: (body?.mathMode as 'omml' | 'tex') || 'omml',
    });
    return {
      buffer,
      filename: `${safeBase}${withAnswers ? '-dapan' : ''}.docx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // ============ KIỂM SOÁT CHẤT LƯỢNG CÂU HỎI ============

  private gradeLike(q: any, stuAns: any): boolean {
    if (q.type === 'MCQ') return stuAns === q.answer;
    if (q.type === 'TRUE_FALSE') {
      if (!q.answer || !stuAns || typeof stuAns !== 'object') return false;
      for (const k of Object.keys(q.answer)) {
        if (stuAns[k] !== q.answer[k]) return false;
      }
      return true;
    }
    if (q.type === 'SHORT_ANSWER') {
      const a = String(q.answer).trim().toLowerCase().replace(/\s+/g, '');
      const b = String(stuAns ?? '').trim().toLowerCase().replace(/\s+/g, '');
      return a.length > 0 && a === b;
    }
    return false;
  }

  // Thống kê tỉ lệ trả lời đúng từng câu → cảnh báo bất thường
  async questionStats(teacherId: string) {
    const bank = await this.getBank(teacherId);

    const attempts = await this.prisma.examAttempt.findMany({
      where: { exam: { teacherId }, submittedAt: { not: null } },
      include: {
        exam: {
          include: { items: { include: { question: true } } },
        },
      },
    });

    const stats = new Map<string, { total: number; correct: number }>();
    for (const a of attempts) {
      const answers = (a.answers as any) || {};
      for (const item of a.exam.items) {
        const q = item.question as any;
        if (q.type === 'ESSAY') continue;
        const stu = answers[item.id];
        if (stu === null || stu === undefined) continue;
        const s = stats.get(q.id) || { total: 0, correct: 0 };
        s.total++;
        if (this.gradeLike(q, stu)) s.correct++;
        stats.set(q.id, s);
      }
    }

    const questions = await this.prisma.question.findMany({
      where: { bankId: bank.id },
      include: { topic: true },
    });

    const rows = questions.map((q) => {
      const s = stats.get(q.id);
      const total = s?.total ?? 0;
      const correct = s?.correct ?? 0;
      const rate = total > 0 ? correct / total : null;
      let flag: string | null = null;
      if (total >= 5 && rate !== null) {
        if (rate < 0.25) flag = 'quá khó hoặc nghi sai đáp án';
        else if (rate > 0.95) flag = 'quá dễ';
      }
      return {
        id: q.id,
        code: q.code,
        type: q.type,
        topicName: q.topic?.name || '—',
        difficulty: q.difficulty,
        content: (q.content || '').slice(0, 120),
        total,
        correct,
        rate: rate === null ? null : Math.round(rate * 100),
        flag,
      };
    });

    const flagged = rows.filter((r) => r.flag);
    const withData = rows.filter((r) => r.total > 0).length;

    return {
      total: rows.length,
      withData,
      flaggedCount: flagged.length,
      flagged: flagged.slice(0, 100),
      summary: {
        quakho: flagged.filter((f) => f.flag?.includes('khó')).length,
        quade: flagged.filter((f) => f.flag?.includes('dễ')).length,
      },
    };
  }

  // ============ HELPER ============

  private async ensureOwnTopic(teacherId: string, topicId: string) {
    const bank = await this.getBank(teacherId);
    const topic = await this.prisma.topic.findFirst({
      where: { id: topicId, bankId: bank.id },
    });
    if (!topic) throw new NotFoundException('Không tìm thấy chủ đề');
    return topic;
  }

  // ============ NHẬP ĐỀ TỪ .tex (ex_test) ============

  async importTex(teacherId: string, texSource: string) {
    const bank = await this.getBank(teacherId);
    const parsed = this.parseTex(texSource);
    const created: any[] = [];
    for (const p of parsed) {
      const code = await this.generateUniqueCode(p.type);
      const question = await this.prisma.question.create({
        data: {
          code,
          bankId: bank.id,
          type: p.type,
          content: p.content,
          options: (p.options as any) ?? null,
          answer: p.answer as any,
          solution: p.solution,
          texSource,
        },
      });
      created.push(question);
    }
    return { imported: created.length, questions: created };
  }

  // Ngữ cảnh phân loại AI: các DẠNG BÀI LÁ trong cây mục lục (CHƯƠNG → Bài → Dạng)
  // + danh sách dạng bài tự do đã có trong ngân hàng
  private async classificationContext(bankId: string) {
    const [topics, bankForms] = await Promise.all([
      this.prisma.topic.findMany({
        where: { bankId },
        select: {
          name: true,
          grade: true,
          _count: { select: { children: true } },
        },
      }),
      this.prisma.bankForm.findMany({ where: { bankId } }),
    ]);
    // Chỉ lấy topic LÁ (không có topic con) — đó chính là các "Dạng" trong mục lục
    const leaves = topics
      .filter((t) => (t._count?.children ?? 0) === 0)
      .map((t) => ({ name: t.name, grade: t.grade }));
    return {
      topics: leaves,
      forms: bankForms.map((f) => f.name),
    };
  }

  // Chuẩn hóa tên chủ đề AI trả về (bỏ tiền tố [Lớp N] nếu AI thêm vào)
  private cleanAiTopic(topic: unknown): string {
    return String(topic || '')
      .replace(/^\[Lớp\s*\d+\]\s*/i, '')
      .trim();
  }

  // ============ CHỐNG CÂU HỎI TRÙNG ============

  // Chuẩn hóa nội dung để so trùng: bỏ lệnh LaTeX, dấu, khoảng trắng thừa
  private normalizeQuestion(s: string): string {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      // GIỮ tên lệnh (\sin ≠ \cos, \le ≠ \ge, \cup ≠ \cap) — trước đây xoá hết nên
      // các câu chỉ khác hàm/dấu bị coi là "trùng tuyệt đối"
      .replace(/\\(?:left|right|displaystyle|limits|mathrm|text|quad|qquad|,|;|!)(?![a-zA-Z])/g, ' ')
      .replace(/\\([a-zA-Z]+)\*?/g, ' $1 ')
      .replace(/\^/g, ' ^ ')
      .replace(/_/g, ' _ ')
      .replace(/[{}$&~|\\]/g, ' ')
      .replace(/\s+/g, ' ')
      // bỏ khoảng trắng quanh dấu/toán tử: "y = x - 1" ≡ "y=x-1"
      .replace(/\s*([=+\-*\/<>,.;:()\[\]^_'])\s*/g, '$1')
      .trim();
  }

  // Khoảng cách Levenshtein có NGƯỠNG: chỉ tính trong dải ±max quanh đường chéo và dừng sớm
  // khi chắc chắn vượt ngưỡng → O(n·max) thay vì O(n²), bộ nhớ O(n) thay vì O(n²).
  private levenshtein(a: string, b: string, max = Infinity): number {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    if (Math.abs(m - n) > max) return max + 1;
    const band = Number.isFinite(max) ? Math.ceil(max) : Math.max(m, n);
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const lo = Math.max(1, i - band);
      const hi = Math.min(n, i + band);
      cur.fill(Infinity);
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = lo; j <= hi; j++) {
        const v = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      const t = prev;
      prev = cur;
      cur = t;
    }
    return prev[n];
  }

  private similar(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen < 20) return false; // quá ngắn dễ dính nhầm
    const allowed = Math.floor(maxLen * 0.12);
    return this.levenshtein(a, b, allowed) <= allowed;
  }

  // Đối chiếu các câu mới với kho → trả về câu trùng (kèm nội dung để so sánh).
  // `exact=true` chỉ khi nội dung chuẩn hoá KHỚP TUYỆT ĐỐI; `exact=false` là "nghi trùng"
  // (gần giống) — CHỈ cảnh báo, KHÔNG tự thay thế (đề không bị đổi số).
  private async markDuplicates(
    bankId: string,
    contents: string[],
  ): Promise<({ code: string; id: string; content: string; exact: boolean } | null)[]> {
    if (!contents.length) return [];
    const existing = await this.prisma.question.findMany({
      where: { bankId },
      select: { id: true, code: true, content: true },
    });
    const norms = existing.map((q) => ({
      q,
      n: this.normalizeQuestion(q.content),
    }));
    const result: ({ code: string; id: string; content: string; exact: boolean } | null)[] = [];
    const seen = new Set<string>();
    for (const c of contents) {
      const n = this.normalizeQuestion(c);
      if (!n || seen.has(n)) {
        result.push(null);
        continue;
      }
      seen.add(n);
      let dup: { code: string; id: string; content: string; exact: boolean } | null = null;
      const exact = norms.find((x) => x.n === n);
      if (exact) {
        dup = { code: exact.q.code, id: exact.q.id, content: exact.q.content, exact: true };
      } else {
        // Chỉ so gần giống với các câu có độ dài tương đương (±30%)
        const near = norms.find(
          (x) =>
            x.n &&
            Math.abs(x.n.length - n.length) <= Math.max(n.length, x.n.length) * 0.3 &&
            this.similar(x.n, n),
        );
        if (near) dup = { code: near.q.code, id: near.q.id, content: near.q.content, exact: false };
      }
      result.push(dup);
    }
    return result;
  }

  // Quét toàn kho tìm các CẶP câu trùng nhau
  /**
   * Rà câu trùng trong kho, có thể THU HẸP phạm vi để nhanh hơn:
   * - topicId: chỉ trong 1 thư mục (gồm cả thư mục con); grade: chỉ 1 khối lớp
   * - sameTopic: chỉ so các câu nằm CÙNG chủ đề với nhau
   */
  async findDuplicatePairs(
    teacherId: string,
    opts: { topicId?: string; grade?: number; sameTopic?: boolean } = {},
  ) {
    const bank = await this.getBank(teacherId);
    const where: any = { bankId: bank.id };
    if (opts.grade) where.grade = opts.grade;
    if (opts.topicId) {
      await this.ensureOwnTopic(teacherId, opts.topicId);
      where.topicId = { in: await this.topicWithDescendants(bank.id, opts.topicId) };
    }
    const questions = await this.prisma.question.findMany({
      where,
      select: { id: true, code: true, content: true, createdAt: true, topicId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!opts.sameTopic) return this.duplicatePairsIn(questions);
    // So riêng từng chủ đề
    const byTopic = new Map<string, any[]>();
    for (const q of questions) {
      const k = q.topicId || '_';
      if (!byTopic.has(k)) byTopic.set(k, []);
      byTopic.get(k)!.push(q);
    }
    const all: any[] = [];
    for (const list of byTopic.values()) {
      if (list.length < 2) continue;
      all.push(...(await this.duplicatePairsIn(list)));
      if (all.length > 2000) break;
    }
    return all;
  }

  private async duplicatePairsIn(questions: any[]) {
    const pairs: {
      keep: { id: string; code: string; content: string };
      dup: { id: string; code: string; content: string };
      exact: boolean;
    }[] = [];
    const norms = questions
      .map((q) => ({ q, n: this.normalizeQuestion(q.content) }))
      .filter((x) => !!x.n);
    const pick = (x: any) => ({ id: x.q.id, code: x.q.code, content: x.q.content });

    // 1) Trùng tuyệt đối: gom nhóm bằng Map (O(n)) thay vì so từng cặp
    const groups = new Map<string, typeof norms>();
    for (const x of norms) {
      const g = groups.get(x.n);
      if (g) g.push(x);
      else groups.set(x.n, [x]);
    }
    const reps: typeof norms = [];
    for (const g of groups.values()) {
      reps.push(g[0]);
      for (let k = 1; k < g.length; k++) {
        pairs.push({ keep: pick(g[0]), dup: pick(g[k]), exact: true });
      }
    }

    // 2) Gần giống: chỉ so các câu có độ dài gần nhau (sắp theo độ dài, cửa sổ trượt),
    //    nhường CPU định kỳ để API không bị treo khi kho lớn
    reps.sort((x, y) => x.n.length - y.n.length);
    let ops = 0;
    for (let i = 0; i < reps.length; i++) {
      const li = reps[i].n.length;
      for (let j = i + 1; j < reps.length; j++) {
        const lj = reps[j].n.length;
        if (lj - li > Math.max(li, lj) * 0.12) break;
        if (this.similar(reps[i].n, reps[j].n)) {
          const [keep, dup] =
            reps[i].q.createdAt <= reps[j].q.createdAt ? [reps[i], reps[j]] : [reps[j], reps[i]];
          pairs.push({ keep: pick(keep), dup: pick(dup), exact: false });
        }
        if (++ops % 2000 === 0) await new Promise((r) => setImmediate(r));
      }
      if (pairs.length > 2000) break; // đủ để giáo viên xử lý, tránh trả về quá lớn
    }
    return pairs;
  }

  // Bước 1: tách câu hỏi + AI phân loại thô (chưa lưu) → giáo viên duyệt
  async previewImport(teacherId: string, texSource: string) {
    const failures: { index: number; reason: string; preview: string }[] = [];
    const parsed = this.parseTex(texSource, failures);
    if (!parsed.length) {
      return { questions: [], failed: failures };
    }
    const bank = await this.getBank(teacherId);
    const ctx = await this.classificationContext(bank.id);
    const dupes = await this.markDuplicates(
      bank.id,
      parsed.map((p) => p.content),
    );
    let aiResults: any[] = [];
    try {
      aiResults = await this.ai.classifyQuestionsBatch(
        parsed.map((p) => p.content),
        ctx,
      );
    } catch (e) {
      aiResults = parsed.map(() => ({
        grade: null,
        topic: '',
        difficulty: null,
        form: '',
      }));
    }
    return {
      questions: parsed.map((p, i) => ({
        type: p.type,
        part: { MCQ: 1, TRUE_FALSE: 2, SHORT_ANSWER: 3, ESSAY: 4 }[p.type] ?? 1,
        source: p.source ?? '',
        content: p.content,
        options: p.options ?? null,
        answer: p.answer,
        answerMissing: !!p.answerMissing,
        solution: p.solution ?? '',
        duplicateOf: dupes[i] ?? null,
        ai: {
          grade: aiResults[i]?.grade ?? null,
          topic: this.cleanAiTopic(aiResults[i]?.topic),
          difficulty: aiResults[i]?.difficulty ?? null,
          form: aiResults[i]?.form || '',
        },
      })),
      failed: failures,
    };
  }

  // AI phân loại lại TOÀN BỘ câu hỏi trong ngân hàng theo cây mục lục (dạng lá)
  async reclassifyQuestions(
    teacherId: string,
    opts: {
      grade?: number;
      limit?: number;
      onlyUnclassified?: boolean;
      updatedAfter?: string;
    } = {},
  ) {
    const bank = await this.getBank(teacherId);
    const ctx = await this.classificationContext(bank.id);
    const where: any = { bankId: bank.id };
    if (opts.grade) where.grade = opts.grade;
    if (opts.onlyUnclassified) {
      where.OR = [{ topicId: null }, { aiClassified: false }];
    }
    // Chỉ phân loại các câu vừa cập nhật từ mốc thời gian này
    if (opts.updatedAfter) {
      const d = new Date(opts.updatedAfter);
      if (!isNaN(d.getTime())) where.updatedAt = { gte: d };
    }
    const take = Math.min(Math.max(Number(opts.limit) || 200, 1), 500);
    const questions = await this.prisma.question.findMany({
      where,
      orderBy: opts.updatedAfter ? { updatedAt: 'desc' } : { createdAt: 'asc' },
      take,
      select: { id: true, content: true, grade: true, topicId: true, form: true, difficulty: true },
    });
    if (!questions.length) return { total: 0, updated: 0, matched: 0 };

    // Map tên dạng lá (lowercase) → topicId
    const allTopics = await this.prisma.topic.findMany({
      where: { bankId: bank.id },
      include: { _count: { select: { children: true } } },
    });
    const leafByName = new Map<string, string>();
    for (const t of allTopics) {
      if ((t._count?.children ?? 0) === 0) {
        leafByName.set(String(t.name).trim().toLowerCase(), t.id);
      }
    }

    const BATCH = 8;
    let updated = 0;
    let matched = 0;
    for (let i = 0; i < questions.length; i += BATCH) {
      const chunk = questions.slice(i, i + BATCH);
      let res: any[] = [];
      try {
        res = await this.ai.classifyQuestionsBatch(
          chunk.map((q) => q.content),
          ctx,
        );
      } catch (e) {
        res = [];
      }
      for (let j = 0; j < chunk.length; j++) {
        const q = chunk[j];
        const r = res[j] || {};
        const leafId = leafByName.get(String(r.topic || '').trim().toLowerCase()) || null;
        if (leafId) matched++;
        await this.prisma.question.update({
          where: { id: q.id },
          data: {
            grade: r.grade ?? q.grade ?? null,
            topicId: leafId ?? q.topicId,
            form: r.form ? String(r.form).trim().slice(0, 200) : q.form,
            difficulty: r.difficulty ?? q.difficulty,
            aiClassified: true,
          },
        });
        updated++;
      }
    }
    return { total: questions.length, updated, matched };
  }

  // Bước 2: lưu vào ngân hàng theo phân loại giáo viên đã chỉnh
  async confirmImport(
    teacherId: string,
    questions: any[],
    texSource: string,
  ) {
    const bank = await this.getBank(teacherId);
    const created: any[] = [];
    for (const q of questions) {
      let topicId: string | null = null;
      const topicName: string = this.cleanAiTopic(q.topicName || q.ai?.topic);
      if (topicName) {
        const grade: number | null = q.grade ?? q.ai?.grade ?? null;
        let topic = await this.prisma.topic.findFirst({
          where: { bankId: bank.id, name: topicName, grade: grade ?? null },
        });
        if (!topic) {
          topic = await this.prisma.topic.create({
            data: { bankId: bank.id, name: topicName, grade },
          });
        }
        topicId = topic.id;
      }

      const code = await this.generateUniqueCode(q.type);
      const question = await this.prisma.question.create({
        data: {
          code,
          bankId: bank.id,
          type: q.type,
          content: q.content,
          options: (q.options as any) ?? null,
          answer: q.answer as any,
          solution: q.solution || null,
          grade: q.grade ?? q.ai?.grade ?? null,
          topicId,
          difficulty: q.difficulty ?? q.ai?.difficulty ?? null,
          form: (q.form || q.ai?.form || '').trim() || null,
          texSource,
        },
      });
      created.push(question);
      // Biên dịch sẵn hình tikz trong câu vừa nạp
      this.precompileTikz(q.content, q.solution);
    }
    return { imported: created.length, questions: created };
  }

  // ============ NHẬP ĐỀ THI (đề hoàn chỉnh → ngân hàng + Kho đề thi) ============

  // Bước 1+2: tách câu hỏi + AI phân loại thô (phần, chủ đề, lớp, độ khó, dạng bài)
  async importExamPreview(teacherId: string, texSource: string) {
    const parsed = this.parseTex(texSource);
    if (!parsed.length) {
      return { questions: [], partCounts: {} };
    }

    const bank = await this.getBank(teacherId);
    const ctx = await this.classificationContext(bank.id);
    const dupes = await this.markDuplicates(
      bank.id,
      parsed.map((p) => p.content),
    );
    let aiResults: any[] = [];
    try {
      aiResults = await this.ai.classifyQuestionsBatch(
        parsed.map((p) => p.content),
        ctx,
      );
    } catch (e) {
      aiResults = parsed.map(() => ({
        grade: null,
        topic: '',
        difficulty: null,
        form: '',
      }));
    }

    // Phần mặc định theo dạng câu hỏi
    const partByType: Record<string, number> = {
      MCQ: 1,
      TRUE_FALSE: 2,
      SHORT_ANSWER: 3,
      ESSAY: 4,
    };

    const questions = parsed.map((p, i) => ({
      type: p.type,
      source: p.source ?? '',
      content: p.content,
      options: p.options ?? null,
      answer: p.answer,
      answerMissing: !!p.answerMissing,
      solution: p.solution ?? '',
      part: partByType[p.type] ?? 1,
      topicName: this.cleanAiTopic(aiResults[i]?.topic),
      grade: aiResults[i]?.grade ?? null,
      difficulty: aiResults[i]?.difficulty || '',
      form: aiResults[i]?.form || '',
      duplicateOf: dupes[i] ?? null,
      ai: {
        grade: aiResults[i]?.grade ?? null,
        topic: this.cleanAiTopic(aiResults[i]?.topic),
        difficulty: aiResults[i]?.difficulty ?? null,
        form: aiResults[i]?.form || '',
      },
    }));

    // Đếm số câu từng phần (để gợi ý điểm)
    const partCounts: Record<number, number> = {};
    for (const q of questions) {
      partCounts[q.part] = (partCounts[q.part] || 0) + 1;
    }

    return { questions, partCounts };
  }

  // Bước 3+4: lưu câu hỏi vào ngân hàng + tạo đề thi
  async importExamConfirm(teacherId: string, body: any) {
    const { title, grade, topicId, difficulty, duration, published, texSource, parts, questions, folderId } = body || {};

    if (!title || !title.trim()) {
      throw new NotFoundException('Vui lòng nhập tên đề thi');
    }
    if (!Array.isArray(questions) || !questions.length) {
      throw new NotFoundException('Đề thi không có câu hỏi');
    }

    const bank = await this.getBank(teacherId);

    // Điểm từng phần do giáo viên cấu hình: { 1: totalScore, 2: ..., 3: ..., 4: ... }
    const partScores: Record<number, number> = {};
    if (Array.isArray(parts)) {
      for (const p of parts) {
        partScores[Number(p.part)] = Number(p.score) || 0;
      }
    }

    // 1. Lưu từng câu hỏi vào ngân hàng đề
    //    Câu trùng bị GV tick "bỏ qua" → ĐỀ dùng lại câu đã có trong kho (không tạo bản sao)
    const saved: { questionId: string; input: any; reused: boolean }[] = [];
    for (const q of questions) {
      let reused = false;
      let questionId: string | null = null;

      if (q.skipBank && q.duplicateOf?.id) {
        const existing = await this.prisma.question.findFirst({
          where: { id: q.duplicateOf.id, bankId: bank.id },
        });
        if (existing) {
          questionId = existing.id;
          reused = true;
        }
      }

      if (!questionId) {
        const topicName: string = this.cleanAiTopic(q.topicName || q.ai?.topic);
        let qTopicId: string | null = null;
        if (topicName) {
          const qGrade: number | null = q.grade ?? q.ai?.grade ?? null;
          let topic = await this.prisma.topic.findFirst({
            where: { bankId: bank.id, name: topicName, grade: qGrade ?? null },
          });
          if (!topic) {
            topic = await this.prisma.topic.create({
              data: { bankId: bank.id, name: topicName, grade: qGrade },
            });
          }
          qTopicId = topic.id;
        }

        const code = await this.generateUniqueCode(q.type);
        const question = await this.prisma.question.create({
          data: {
            code,
            bankId: bank.id,
            type: q.type,
            content: q.content,
            options: q.options ?? null,
            answer: q.answer,
            solution: q.solution || null,
            grade: q.grade ?? null,
            topicId: qTopicId,
            difficulty: q.difficulty || null,
            form: (q.form || q.ai?.form || '').trim() || null,
            texSource: texSource || null,
          },
        });
        questionId = question.id;
        this.precompileTikz(q.content, q.solution);
      }

      saved.push({ questionId, input: q, reused });
    }

    // 2. Tính điểm từng câu theo phần
    const countByPart: Record<number, number> = {};
    for (const s of saved) {
      const part = Number(s.input.part) || 1;
      countByPart[part] = (countByPart[part] || 0) + 1;
    }
    const perQuestionScore = (part: number, count: number) => {
      const total = partScores[part] ?? 0;
      if (!count) return 0;
      return Math.round((total / count) * 100) / 100;
    };

    // 3. Tạo items theo thứ tự part → thứ tự gốc
    const items = saved.map((s, idx) => ({
      questionId: s.questionId,
      part: Number(s.input.part) || 1,
      order: idx + 1,
      score: perQuestionScore(Number(s.input.part) || 1, countByPart[Number(s.input.part) || 1] || 1),
    }));

    // 4. Tạo đề thi
    const exam = await this.examsService.createFromImport(teacherId, {
      title: title.trim(),
      grade: grade ?? null,
      topicId: topicId || null,
      difficulty: difficulty || null,
      duration: duration ?? 45,
      published: !!published,
      folderId: folderId || null,
      items,
    });

    return {
      ...exam,
      importedQuestions: saved.filter((s) => !s.reused).length,
    };
  }

  // Bỏ comment LaTeX: từ dấu % (không phải \%) tới hết dòng
  private stripTexComments(tex: string): string {
    return tex
      .split('\n')
      .map((line) => {
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '\\') {
            i++;
            continue;
          }
          if (line[i] === '%') return line.slice(0, i);
        }
        return line;
      })
      .join('\n');
  }

  // Vị trí '{' của nhóm kế tiếp nếu nó nằm ngay sau pos (chỉ cách khoảng trắng), ngược lại -1
  private nextGroupStart(text: string, pos: number): number {
    let i = pos;
    while (i < text.length && /\s/.test(text[i])) i++;
    return text[i] === '{' ? i : -1;
  }

  private getBalancedContent(
    text: string,
    startIndex: number,
  ): { content: string; endIndex: number } | null {
    if (text[startIndex] !== '{') return null;
    let count = 0;
    for (let i = startIndex; i < text.length; i++) {
      if (text[i] === '\\') {
        i++;
        continue;
      }
      if (text[i] === '{') count++;
      else if (text[i] === '}') {
        count--;
        if (count === 0) {
          return { content: text.substring(startIndex + 1, i), endIndex: i };
        }
      }
    }
    return null;
  }

  // Phân tích lại 1 câu (khi GV sửa code inline ở bước phân loại)
  async parseQuestionBlock(teacherId: string, tex: string) {
    const parsed = this.parseTex(tex || '');
    if (!parsed.length) {
      throw new NotFoundException(
        'Không phân tích được câu hỏi — kiểm tra cấu trúc \\begin{ex}...\\end{ex}',
      );
    }
    const p = parsed[0];
    return {
      type: p.type,
      content: p.content,
      options: p.options ?? null,
      answer: p.answer,
      answerMissing: !!p.answerMissing,
      solution: p.solution ?? '',
      source: p.source ?? tex,
    };
  }

  private parseTex(
    tex: string,
    failures?: { index: number; reason: string; preview: string }[],
  ): any[] {
    // Chuẩn hoá: \begin{vd} (ví dụ) và \begin{bt} (bài tập) → \begin{ex} (câu hỏi)
    const normalized = this.stripTexComments(String(tex || ''))
      .replace(/\\begin\{vd\}/g, '\\begin{ex}')
      .replace(/\\end\{vd\}/g, '\\end{ex}')
      .replace(/\\begin\{bt\}/g, '\\begin{ex}')
      .replace(/\\end\{bt\}/g, '\\end{ex}');
    const results: any[] = [];
    const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
    let match;
    let idx = 0;
    while ((match = exRegex.exec(normalized)) !== null) {
      idx++;
      const q = this.parseExBlock(match[1]);
      if (!q) {
        if (failures) {
          failures.push({
            index: idx,
            reason: 'Không phân tích được cấu trúc câu hỏi',
            preview: match[1].replace(/\s+/g, ' ').trim().slice(0, 80),
          });
        }
        continue;
      }
      // Xoá \break / \qquad / \quad trong nội dung, lời giải và lựa chọn
      q.content = this.stripSpacingCmds(q.content);
      if (q.solution) q.solution = this.stripSpacingCmds(q.solution);
      if (Array.isArray(q.options)) {
        q.options = q.options.map((o: any) => ({
          ...o,
          text: this.stripSpacingCmds(o?.text),
        }));
      }
      // Khối rỗng (không có nội dung lẫn đáp án) → coi là lỗi biên dịch
      const hasContent =
        String(q.content || '').trim().length > 0 ||
        (q.solution && String(q.solution).trim().length > 0);
      if (!hasContent) {
        if (failures) {
          failures.push({
            index: idx,
            reason: 'Khối câu hỏi rỗng (không có nội dung)',
            preview: '',
          });
        }
        continue;
      }
      q.source = '\\begin{ex}' + match[1] + '\\end{ex}';
      results.push(q);
    }
    return results;
  }

  private parseExBlock(block: string): any {
    let raw = block.trim();
    let solution = '';

    // 1. Lấy \loigiai (balanced để xử lý ngoặc lồng như \frac{..}{..}); nhận cả dạng có tham số [oly]
    const lgMatch = /\\loigiai(?:\[[^\]]*\])?\s*\{/.exec(raw);
    if (lgMatch) {
      const balanced = this.getBalancedContent(
        raw,
        lgMatch.index + lgMatch[0].length - 1,
      );
      if (balanced) {
        solution = balanced.content.trim();
        raw =
          raw.substring(0, lgMatch.index) + raw.substring(balanced.endIndex + 1);
      }
    }

    // 2. \shortans (trả lời ngắn) — nhận cả dạng \shortans[oly]{6,36}
    // Trả lời ngắn: \shortans, \SA (lệnh tắt) và \dapso (ghi đáp số) của ex_test.sty
    // — chỉ khi câu KHÔNG có \choice/\choiceTF
    const hasChoice = /\\choice(?:TF)?(?![a-zA-Z])/.test(raw);
    const saMatch = hasChoice
      ? null
      : /\\(?:shortans|SA|dapso)(?![a-zA-Z])(?:\[[^\]]*\])?\s*\{/.exec(raw);
    if (saMatch) {
      const balanced = this.getBalancedContent(
        raw,
        saMatch.index + saMatch[0].length - 1,
      );
      let answer = '';
      if (balanced) {
        answer = balanced.content.trim();
        raw =
          raw.substring(0, saMatch.index) + raw.substring(balanced.endIndex + 1);
      }
      return {
        type: QuestionType.SHORT_ANSWER,
        content: raw.trim(),
        options: null,
        answer,
        solution: solution || undefined,
      };
    }

    // 3. \choice (MCQ) — nhận cả dạng \choice[oly]{...}
    const choiceMatch = /\\choice(?:\[[^\]]*\])?\s*\{/.exec(raw);
    if (choiceMatch) {
      const options: any[] = [];
      let answer: string | null = null;
      let answerMissing = true;
      let currentIndex = choiceMatch.index + choiceMatch[0].length - 1;
      let lastEnd = currentIndex;
      for (let i = 0; i < 4; i++) {
        const balanced = this.getBalancedContent(raw, currentIndex);
        if (balanced) {
          let text = balanced.content.trim();
          const id = String.fromCharCode(65 + i);
          if (text.includes('\\True')) {
            answer = id;
            answerMissing = false;
            text = text.replace(/\\True\s*/g, '').trim();
          }
          options.push({ id, text });
          lastEnd = balanced.endIndex + 1;
          // Lựa chọn tiếp theo phải nằm NGAY sau (chỉ cách khoảng trắng) — trước đây tìm '{'
          // bất kỳ phía sau nên câu < 4 lựa chọn lấy nhầm {tikzpicture} làm phương án
          const next = this.nextGroupStart(raw, lastEnd);
          if (next === -1) break;
          currentIndex = next;
        } else {
          break;
        }
      }
      // Phần còn lại sau lựa chọn cuối (hình tikz/bảng...) ghép vào nội dung câu hỏi
      const leftover = raw.substring(lastEnd).trim();
      const content = (
        raw.substring(0, choiceMatch.index).trim() +
        (leftover ? '\n' + leftover : '')
      ).trim();
      return {
        type: QuestionType.MCQ,
        content,
        options,
        answer,
        answerMissing,
        solution: solution || undefined,
      };
    }

    // 4. \choiceTF (Đúng/Sai) — nhận cả dạng \choiceTF[oly]{...}
    const tfMatch = /\\choiceTF(?:\[[^\]]*\])?\s*\{/.exec(raw);
    if (tfMatch) {
      const options: any[] = [];
      const answer: any = {};
      const ids = ['a', 'b', 'c', 'd'];
      let hasAnyMarker = false;
      let currentIndex = tfMatch.index + tfMatch[0].length - 1;
      let lastEnd = currentIndex;
      for (let i = 0; i < 4; i++) {
        const balanced = this.getBalancedContent(raw, currentIndex);
        if (balanced) {
          let text = balanced.content.trim();
          const id = ids[i] || String(i + 1);
          let isTrue = false;
          let marked = false;
          if (text.includes('\\FalseTF')) {
            isTrue = false;
            marked = true;
          } else if (text.includes('\\TrueTF') || text.includes('\\True')) {
            isTrue = true;
            marked = true;
          }
          if (marked) hasAnyMarker = true;
          text = text
            .replace(/\\TrueTF\s*/g, '')
            .replace(/\\FalseTF\s*/g, '')
            .replace(/\\True\s*/g, '')
            .trim();
          options.push({ id, text });
          answer[id] = isTrue;
          lastEnd = balanced.endIndex + 1;
          // Lựa chọn tiếp theo phải nằm NGAY sau (chỉ cách khoảng trắng) — trước đây tìm '{'
          // bất kỳ phía sau nên câu < 4 lựa chọn lấy nhầm {tikzpicture} làm phương án
          const next = this.nextGroupStart(raw, lastEnd);
          if (next === -1) break;
          currentIndex = next;
        } else {
          break;
        }
      }
      // Phần còn lại sau lựa chọn cuối (hình tikz/bảng...) ghép vào nội dung câu hỏi
      const leftover = raw.substring(lastEnd).trim();
      const content = (
        raw.substring(0, tfMatch.index).trim() +
        (leftover ? '\n' + leftover : '')
      ).trim();
      // Không có bất kỳ dấu \TrueTF/\FalseTF/\True nào → chưa xác định được đáp án
      const answerMissing = !hasAnyMarker;
      return {
        type: QuestionType.TRUE_FALSE,
        content,
        options,
        answer,
        answerMissing,
        solution: solution || undefined,
      };
    }

    // 5. Tự luận
    return {
      type: QuestionType.ESSAY,
      content: raw.trim(),
      options: null,
      answer: { rubric: solution || '' },
      solution: solution || undefined,
    };
  }
}
