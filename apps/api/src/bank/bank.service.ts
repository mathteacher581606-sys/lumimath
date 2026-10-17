import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { ExamsService, extractTikzBlocks } from '../exams/exams.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class BankService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly examsService: ExamsService,
  ) {}

  private async getBank(teacherId: string) {
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
      orderBy: [{ grade: 'asc' }, { name: 'asc' }],
    });
  }

  async createTopic(teacherId: string, dto: CreateTopicDto) {
    const bank = await this.getBank(teacherId);
    return this.prisma.topic.create({
      data: {
        bankId: bank.id,
        name: dto.name,
        grade: dto.grade,
        parentId: dto.parentId,
      },
    });
  }

  async updateTopic(teacherId: string, topicId: string, dto: UpdateTopicDto) {
    await this.ensureOwnTopic(teacherId, topicId);
    return this.prisma.topic.update({
      where: { id: topicId },
      data: { ...dto },
    });
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
      // Tìm theo ID/mã câu hỏi (vd: A398335) — không phân biệt hoa thường
      where.code = { contains: String(query.code).toUpperCase() };
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
    if (query?.topicId) where.topicId = String(query.topicId);
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

  async createQuestion(teacherId: string, dto: CreateQuestionDto) {
    const bank = await this.getBank(teacherId);
    const code = await this.generateUniqueCode(dto.type);

    // Xử lý chủ đề: nếu gửi topicName thì tìm hoặc tạo Topic
    let topicId: string | undefined = dto.topicId;
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
        content: dto.content,
        options: dto.options ?? null,
        answer: dto.answer,
        solution: dto.solution,
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
  private precompileTikz(...texts: (string | undefined | null)[]) {
    const blocks = texts.flatMap((t) => extractTikzBlocks(t || '')).slice(0, 10);
    if (!blocks.length) return;
    Promise.all(
      blocks.map((b) => this.examsService.compileTikzSnippet(b).catch(() => {})),
    ).catch(() => {});
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
    const match = candidates.find((c) => {
      const cn = this.normalizeQuestion(c.content);
      if (!cn) return false;
      if (cn === n) return true;
      return (
        Math.abs(cn.length - n.length) <= Math.max(cn.length, n.length) * 0.3 &&
        this.similar(cn, n)
      );
    });
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

    let examItems = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const id of ownedIds) {
        // Câu sống = câu cùng nội dung KHÔNG nằm trong danh sách xóa lần này
        const survivor = await this.findSurvivor(bank.id, id, ownedIds);
        const r = await this.relinkOrRemoveLinks(tx, id, survivor);
        examItems += r.examItems;
        await tx.question.delete({ where: { id } });
      }
    });

    return {
      deleted: ownedIds.length,
      removed: { examItems },
      message: `Đã xóa ${ownedIds.length} câu hỏi${examItems ? ` — ${examItems} đề thi chuyển sang dùng câu cùng nội dung` : ''}.`,
    };
  }

  // Danh sách câu hỏi CÓ PHÂN TRANG + SẮP XẾP (cho toolbar ngân hàng đề)
  async listQuestionsPaged(teacherId: string, query: any) {
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
      // Tìm theo ID/mã câu hỏi (vd: A398335) — không phân biệt hoa thường
      where.code = { contains: String(query.code).toUpperCase() };
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

  // Ngữ cảnh phân loại AI: danh sách chủ đề + dạng bài đã có trong ngân hàng
  private async classificationContext(bankId: string) {
    const [topics, bankForms] = await Promise.all([
      this.prisma.topic.findMany({
        where: { bankId },
        select: { name: true, grade: true },
      }),
      this.prisma.bankForm.findMany({ where: { bankId } }),
    ]);
    return {
      topics: topics as { name: string; grade: number | null }[],
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
      .replace(/\\[a-zA-Z]+\*?/g, ' ')
      .replace(/[{}()\[\]$&^_~|\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[m][n];
  }

  private similar(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen < 20) return false; // quá ngắn dễ dính nhầm
    return 1 - this.levenshtein(a, b) / maxLen >= 0.88;
  }

  // Đối chiếu các câu mới với kho → trả về câu trùng (kèm nội dung để so sánh)
  private async markDuplicates(
    bankId: string,
    contents: string[],
  ): Promise<({ code: string; id: string; content: string } | null)[]> {
    if (!contents.length) return [];
    const existing = await this.prisma.question.findMany({
      where: { bankId },
      select: { id: true, code: true, content: true },
    });
    const norms = existing.map((q) => ({
      q,
      n: this.normalizeQuestion(q.content),
    }));
    const result: ({ code: string; id: string; content: string } | null)[] = [];
    const seen = new Set<string>();
    for (const c of contents) {
      const n = this.normalizeQuestion(c);
      if (!n || seen.has(n)) {
        result.push(null);
        continue;
      }
      seen.add(n);
      let dup: { code: string; id: string; content: string } | null = null;
      const exact = norms.find((x) => x.n === n);
      if (exact) {
        dup = { code: exact.q.code, id: exact.q.id, content: exact.q.content };
      } else {
        // Chỉ so gần giống với các câu có độ dài tương đương (±30%)
        const near = norms.find(
          (x) =>
            x.n &&
            Math.abs(x.n.length - n.length) <= Math.max(n.length, x.n.length) * 0.3 &&
            this.similar(x.n, n),
        );
        if (near) dup = { code: near.q.code, id: near.q.id, content: near.q.content };
      }
      result.push(dup);
    }
    return result;
  }

  // Quét toàn kho tìm các CẶP câu trùng nhau
  async findDuplicatePairs(teacherId: string) {
    const bank = await this.getBank(teacherId);
    const questions = await this.prisma.question.findMany({
      where: { bankId: bank.id },
      select: { id: true, code: true, content: true },
      orderBy: { createdAt: 'asc' },
    });
    const pairs: {
      keep: { id: string; code: string; content: string };
      dup: { id: string; code: string; content: string };
      exact: boolean;
    }[] = [];
    const norms = questions.map((q) => ({
      q,
      n: this.normalizeQuestion(q.content),
    }));
    for (let i = 0; i < norms.length; i++) {
      if (!norms[i].n) continue;
      for (let j = i + 1; j < norms.length; j++) {
        if (!norms[j].n) continue;
        if (norms[i].n === norms[j].n) {
          pairs.push({
            keep: { id: norms[i].q.id, code: norms[i].q.code, content: norms[i].q.content },
            dup: { id: norms[j].q.id, code: norms[j].q.code, content: norms[j].q.content },
            exact: true,
          });
        } else if (
          Math.abs(norms[i].n.length - norms[j].n.length) <=
            Math.max(norms[i].n.length, norms[j].n.length) * 0.3 &&
          this.similar(norms[i].n, norms[j].n)
        ) {
          pairs.push({
            keep: { id: norms[i].q.id, code: norms[i].q.code, content: norms[i].q.content },
            dup: { id: norms[j].q.id, code: norms[j].q.code, content: norms[j].q.content },
            exact: false,
          });
        }
      }
    }
    return pairs;
  }

  // Bước 1: tách câu hỏi + AI phân loại thô (chưa lưu) → giáo viên duyệt
  async previewImport(teacherId: string, texSource: string) {
    const parsed = this.parseTex(texSource);
    if (!parsed.length) {
      return { questions: [] };
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
        content: p.content,
        options: p.options ?? null,
        answer: p.answer,
        solution: p.solution ?? '',
        duplicateOf: dupes[i] ?? null,
        ai: {
          grade: aiResults[i]?.grade ?? null,
          topic: this.cleanAiTopic(aiResults[i]?.topic),
          difficulty: aiResults[i]?.difficulty ?? null,
          form: aiResults[i]?.form || '',
        },
      })),
    };
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
          grade: q.grade ?? null,
          topicId,
          difficulty: q.difficulty ?? null,
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
      content: p.content,
      options: p.options ?? null,
      answer: p.answer,
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

  private parseTex(tex: string): any[] {
    const results: any[] = [];
    const exRegex = /\\begin\{ex\}([\s\S]*?)\\end\{ex\}/g;
    let match;
    while ((match = exRegex.exec(tex)) !== null) {
      const q = this.parseExBlock(match[1]);
      if (q) results.push(q);
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
    const saMatch = /\\shortans(?:\[[^\]]*\])?\s*\{/.exec(raw);
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
      let answer = 'A';
      let currentIndex = choiceMatch.index + choiceMatch[0].length - 1;
      let lastEnd = currentIndex;
      for (let i = 0; i < 4; i++) {
        const balanced = this.getBalancedContent(raw, currentIndex);
        if (balanced) {
          let text = balanced.content.trim();
          const id = String.fromCharCode(65 + i);
          if (text.includes('\\True')) {
            answer = id;
            text = text.replace(/\\True\s*/g, '').trim();
          }
          options.push({ id, text });
          lastEnd = balanced.endIndex + 1;
          const nextBrace = raw.indexOf('{', balanced.endIndex + 1);
          if (nextBrace !== -1) currentIndex = nextBrace;
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
        solution: solution || undefined,
      };
    }

    // 4. \choiceTF (Đúng/Sai) — nhận cả dạng \choiceTF[oly]{...}
    const tfMatch = /\\choiceTF(?:\[[^\]]*\])?\s*\{/.exec(raw);
    if (tfMatch) {
      const options: any[] = [];
      const answer: any = {};
      const ids = ['a', 'b', 'c', 'd'];
      let currentIndex = tfMatch.index + tfMatch[0].length - 1;
      let lastEnd = currentIndex;
      for (let i = 0; i < 4; i++) {
        const balanced = this.getBalancedContent(raw, currentIndex);
        if (balanced) {
          let text = balanced.content.trim();
          const id = ids[i] || String(i + 1);
          let isTrue = false;
          if (text.includes('\\FalseTF')) {
            isTrue = false;
          } else if (text.includes('\\TrueTF') || text.includes('\\True')) {
            isTrue = true;
          }
          text = text
            .replace(/\\TrueTF\s*/g, '')
            .replace(/\\FalseTF\s*/g, '')
            .replace(/\\True\s*/g, '')
            .trim();
          options.push({ id, text });
          answer[id] = isTrue;
          lastEnd = balanced.endIndex + 1;
          const nextBrace = raw.indexOf('{', balanced.endIndex + 1);
          if (nextBrace !== -1) currentIndex = nextBrace;
        }
      }
      // Phần còn lại sau lựa chọn cuối (hình tikz/bảng...) ghép vào nội dung câu hỏi
      const leftover = raw.substring(lastEnd).trim();
      const content = (
        raw.substring(0, tfMatch.index).trim() +
        (leftover ? '\n' + leftover : '')
      ).trim();
      return {
        type: QuestionType.TRUE_FALSE,
        content,
        options,
        answer,
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
