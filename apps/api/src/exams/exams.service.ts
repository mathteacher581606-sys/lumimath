import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { QuestionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { buildTablePdf, buildXlsx, escapeTex, safeFilename } from '../common/export.helper';
import { fixFromLog, normalizeTex, texToPlainText } from '../common/tex-autofix';
import * as XLSX from 'xlsx';

// Thư mục lưu cache ảnh TikZ (dùng chung cho mọi người dùng, sống sót qua restart)
const TIKZ_DIR = path.join(process.cwd(), 'storage', 'tikz');

// Trích các block tikz/tkz-tab VÀ bảng tabular từ nội dung câu hỏi
export function extractTikzBlocks(text: string): string[] {
  const blocks: string[] = [];
  // tikzpicture: khớp CÂN BẰNG (chịu lồng nhau, ví dụ \def\pica{\begin{tikzpicture}...})
  const t = text || '';
  const BEGIN = '\\begin{tikzpicture}';
  const END = '\\end{tikzpicture}';
  let idx = 0;
  while ((idx = t.indexOf(BEGIN, idx)) !== -1) {
    let depth = 1;
    let pos = idx + BEGIN.length;
    while (depth > 0) {
      const nb = t.indexOf(BEGIN, pos);
      const ne = t.indexOf(END, pos);
      if (ne === -1) break;
      if (nb !== -1 && nb < ne) {
        depth++;
        pos = nb + BEGIN.length;
      } else {
        depth--;
        pos = ne + END.length;
      }
    }
    if (depth === 0) {
      blocks.push(t.slice(idx, pos));
      idx = pos;
    } else {
      idx = idx + BEGIN.length;
    }
  }
  // tabular (không lồng) + các biến thể tikz* còn lại
  const regex =
    /\\begin\{(tabular|tikzcd|tikzto\w*)\}(\[[^\]]*\])?[\s\S]*?\\end\{\1\}/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(t)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

@Injectable()
export class ExamsService {
  // Cache hình TikZ: hash → PNG (biên dịch 1 lần, dùng lại mãi)
  private tikzPngCache = new Map<string, Buffer>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
    private readonly ai: AiService,
    private readonly mail: MailService,
  ) {}

  // PDF → PNG (pdfjs-dist + canvas, thuần Node trên Máy A)
  private async pdfToPng(pdf: Buffer): Promise<Buffer> {
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('@napi-rs/canvas');

    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(pdf),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const png = canvas.toBuffer('image/png');
    try {
      await doc.destroy();
    } catch {
      // pdfjs v6: dùng cleanup thay destroy
      try {
        await (doc as any).cleanup?.();
      } catch {
        /* bỏ qua */
      }
    }
    return png;
  }

  private async getBank(teacherId: string) {
    const bank = await this.prisma.questionBank.findUnique({
      where: { teacherId },
    });
    if (!bank) throw new NotFoundException('Chưa có ngân hàng đề');
    return bank;
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ============ TẠO ĐỀ (sinh ngẫu nhiên theo ma trận) ============

  // Tạo đề từ danh sách câu hỏi CỤ THỂ (dùng cho "Nhập đề thi")
  async createFromImport(
    teacherId: string,
    data: {
      title: string;
      grade?: number;
      topicId?: string | null;
      difficulty?: string | null;
      duration?: number;
      published?: boolean;
      folderId?: string | null;
      items: { questionId: string; part: number; order: number; score: number }[];
    },
  ) {
    const totalScore = Math.round(
      data.items.reduce((s, i) => s + i.score, 0) * 100,
    ) / 100;

    let folderId: string | null = null;
    if (data.folderId) {
      const folder = await this.prisma.examFolder.findFirst({
        where: { id: data.folderId, teacherId },
      });
      if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
      folderId = data.folderId;
    }

    const exam = await this.prisma.exam.create({
      data: {
        teacherId,
        title: data.title,
        grade: data.grade,
        topicId: data.topicId ?? null,
        difficulty: data.difficulty ?? null,
        duration: data.duration ?? 45,
        folderId,
        totalScore,
        status: data.published ? 'PUBLISHED' : 'DRAFT',
        items: { create: data.items },
      },
      include: {
        items: { include: { question: true }, orderBy: { order: 'asc' } },
      },
    });

    // Sinh mã .tex + tổng điểm
    const texSource = this.generateTex(exam.title, exam.items);
    await this.prisma.exam.update({ where: { id: exam.id }, data: { texSource } });

    // Biên dịch sẵn hình tikz/tabular trong các câu
    for (const item of exam.items) {
      const q = item.question as any;
      const blocks = extractTikzBlocks(
        (q.content || '') + '\n' + (q.solution || ''),
      );
      for (const b of blocks.slice(0, 5)) {
        this.compileTikzSnippet(b).catch(() => {});
      }
    }

    return {
      id: exam.id,
      title: exam.title,
      totalScore: exam.totalScore,
      itemCount: exam.items.length,
      texSource,
    };
  }

  // Chọn câu hỏi theo ma trận. fixedIds (nếu có) = các id GV đã duyệt,
  // các ô còn thiếu sẽ được chọn ngẫu nhiên theo luật ma trận.
  private async pickForMatrix(
    bankId: string,
    parts: any[],
    fixedIds?: string[],
  ): Promise<{
    slots: { part: number; order: number; score: number; questionId: string }[];
    totalScore: number;
    missing: number;
  }> {
    const slots: {
      part: number;
      order: number;
      score: number;
      questionId: string | null;
    }[] = [];
    let totalScore = 0;
    let order = 1;
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const count = part.count || 0;
      const score = part.score || 0;
      totalScore += count * score;
      for (let k = 0; k < count; k++) {
        slots.push({ part: p + 1, order: order++, score, questionId: null });
      }
    }

    const usedIds: string[] = [];
    if (fixedIds && fixedIds.length) {
      slots.forEach((s, i) => {
        if (fixedIds[i]) {
          s.questionId = fixedIds[i];
          usedIds.push(fixedIds[i]);
        }
      });
    }

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const need = slots.filter((s) => s.part === p + 1 && !s.questionId).length;
      if (!need) continue;
      const where: any = {
        bankId,
        type: part.type as QuestionType,
        id: { notIn: usedIds },
      };
      if (part.difficulty) where.difficulty = part.difficulty;
      if (part.topicId) where.topicId = part.topicId;
      if (part.form) where.form = part.form;
      if (part.grade) where.grade = Number(part.grade);
      const pool = await this.prisma.question.findMany({ where });
      const picked = this.shuffle(pool).slice(0, need);
      let k = 0;
      for (const s of slots) {
        if (s.part === p + 1 && !s.questionId && k < picked.length) {
          s.questionId = picked[k++].id;
          usedIds.push(s.questionId);
        }
      }
    }

    const missing = slots.filter((s) => !s.questionId).length;
    return {
      slots: slots.map((s) => ({ ...s, questionId: s.questionId! })),
      totalScore,
      missing,
    };
  }

  // SINH ĐỀ + DUYỆT (chưa lưu): trả về câu hỏi đầy đủ theo từng phần để GV duyệt
  async generate(teacherId: string, dto: CreateExamDto) {
    const bank = await this.getBank(teacherId);
    const parts: any[] = dto.matrix?.parts || [];
    const { slots, totalScore, missing } = await this.pickForMatrix(
      bank.id,
      parts,
    );
    const ids = slots.map((s) => s.questionId).filter(Boolean);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids } },
      include: { topic: true },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      totalScore,
      missing,
      parts: parts.map((part: any, p: number) => ({
        part: p + 1,
        type: part.type,
        score: part.score,
        difficulty: part.difficulty || null,
        topicId: part.topicId || null,
        form: part.form || null,
        questions: slots
          .filter((s) => s.part === p + 1)
          .map((s) => byId.get(s.questionId))
          .filter(Boolean),
      })),
    };
  }

  // Trợ giảng thuần: chỉ thao tác trong khóa được giao → không dùng kho đề thi
  private async isAssistantOnly(userId: string): Promise<boolean> {
    const owned = await this.prisma.course.count({ where: { teacherId: userId } });
    if (owned > 0) return false;
    const assisted = await this.prisma.courseAssistant.count({ where: { userId } });
    return assisted > 0;
  }

  async create(teacherId: string, dto: CreateExamDto) {
    if (await this.isAssistantOnly(teacherId)) {
      throw new ForbiddenException('Trợ giảng không được tạo đề thi');
    }
    const bank = await this.getBank(teacherId);
    const parts: any[] = dto.matrix?.parts || [];

    const fixedIds =
      dto.questionIds && dto.questionIds.length ? dto.questionIds : undefined;
    const { slots, totalScore } = await this.pickForMatrix(
      bank.id,
      parts,
      fixedIds,
    );

    const examItems = slots
      .filter((s) => s.questionId)
      .map((s) => ({
        questionId: s.questionId,
        part: s.part,
        order: s.order,
        score: s.score,
      }));

    const exam = await this.prisma.exam.create({
      data: {
        teacherId,
        title: dto.title,
        description: dto.description,
        grade: dto.grade,
        duration: dto.duration ?? 45,
        totalScore,
        matrix: dto.matrix ?? null,
        status: dto.published ? 'PUBLISHED' : 'DRAFT',
        topicId: dto.topicId || null,
        folderId: (dto as any).folderId || null,
        difficulty: dto.difficulty || null,
        maxAttempts: (dto as any).maxAttempts ?? 3,
        passMark: (dto as any).passMark ?? null,
        practiceMode: !!(dto as any).practiceMode,
        answersAtEnd: (dto as any).answersAtEnd !== false,
        oneTimeResults: !!(dto as any).oneTimeResults,
        hideAnswersAt: (dto as any).hideAnswersAt
          ? new Date((dto as any).hideAnswersAt)
          : null,
        extraTime: Number((dto as any).extraTime) || 0,
        items: { create: examItems },
      },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    const texSource = this.generateTex(exam.title, exam.items);
    await this.prisma.exam.update({
      where: { id: exam.id },
      data: { texSource },
    });

    return {
      id: exam.id,
      title: exam.title,
      totalScore: exam.totalScore,
      itemCount: exam.items.length,
      texSource,
    };
  }

  // ============ KHO MA TRẬN ĐỀ (Quản lý ma trận đề) ============

  async listMatrices(teacherId: string) {
    return this.prisma.examMatrix.findMany({
      where: { teacherId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveMatrix(
    teacherId: string,
    body: { id?: string; name: string; data: any },
  ) {
    const name = String(body?.name || 'Ma trận chưa đặt tên').trim().slice(0, 200);
    const data = body?.data ?? {};
    if (body?.id) {
      const existing = await this.prisma.examMatrix.findFirst({
        where: { id: body.id, teacherId },
      });
      if (!existing) throw new NotFoundException('Không tìm thấy ma trận');
      return this.prisma.examMatrix.update({
        where: { id: existing.id },
        data: { name, data },
      });
    }
    return this.prisma.examMatrix.create({
      data: { teacherId, name, data },
    });
  }

  async deleteMatrix(teacherId: string, id: string) {
    const existing = await this.prisma.examMatrix.findFirst({
      where: { id, teacherId },
    });
    if (!existing) throw new NotFoundException('Không tìm thấy ma trận');
    return this.prisma.examMatrix.delete({ where: { id } });
  }

  // ============ MA TRẬN: NHẬP/XUẤT FILE EXCEL ============

  private static readonly MATRIX_TYPE_BY_KEY: Record<string, string> = {
    tn: 'MCQ',
    tnkq: 'MCQ',
    'trắc nghiệm': 'MCQ',
    mcq: 'MCQ',
    'đ/s': 'TRUE_FALSE',
    đs: 'TRUE_FALSE',
    'đúng/sai': 'TRUE_FALSE',
    'đúng sai': 'TRUE_FALSE',
    true_false: 'TRUE_FALSE',
    tln: 'SHORT_ANSWER',
    'trả lời ngắn': 'SHORT_ANSWER',
    short_answer: 'SHORT_ANSWER',
    tl: 'ESSAY',
    'tự luận': 'ESSAY',
    essay: 'ESSAY',
  };

  private static readonly MATRIX_DIFF_BY_KEY: Record<string, string> = {
    '1': 'NHAN_BIET',
    nb: 'NHAN_BIET',
    'nhận biết': 'NHAN_BIET',
    '2': 'THONG_HIEU',
    th: 'THONG_HIEU',
    'thông hiểu': 'THONG_HIEU',
    '3': 'VAN_DUNG',
    vd: 'VAN_DUNG',
    'vận dụng': 'VAN_DUNG',
    '4': 'VAN_DUNG_CAO',
    vdc: 'VAN_DUNG_CAO',
    'vận dụng cao': 'VAN_DUNG_CAO',
  };

  // Đọc file Excel ma trận (6 cột: Phần | Câu | Tên dạng bài | Kiểu | Mức độ | Mã câu hỏi)
  async importMatrixExcel(teacherId: string, buffer: Buffer) {
    const bank = await this.getBank(teacherId);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    if (!wb.SheetNames.length) throw new BadRequestException('File Excel rỗng');
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

    let headIdx = -1;
    let cPhan = -1,
      cCau = -1,
      cForm = -1,
      cKieu = -1,
      cMuc = -1,
      cMa = -1,
      cLop = -1,
      cChuDe = -1;
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const row = (rows[r] || []).map((c: any) => String(c ?? '').trim().toLowerCase());
      const iForm = row.findIndex((c: string) => c.includes('dạng bài') || c.includes('dạng toán'));
      if (iForm >= 0) {
        headIdx = r;
        cPhan = row.findIndex((c: string) => c.includes('phần'));
        cCau = row.findIndex((c: string) => c === 'câu');
        if (cCau < 0) cCau = row.findIndex((c: string) => c.startsWith('câu') && !c.includes('mã'));
        cForm = iForm;
        cKieu = row.findIndex((c: string) => c.includes('kiểu') || c.includes('loại câu'));
        cMuc = row.findIndex((c: string) => c.includes('mức') || c.includes('độ khó'));
        cMa = row.findIndex((c: string) => c.includes('mã câu'));
        cLop = row.findIndex((c: string) => c.includes('lớp'));
        cChuDe = row.findIndex((c: string) => c.includes('chủ đề'));
        break;
      }
    }
    if (headIdx < 0 || cForm < 0) {
      throw new BadRequestException(
        'File không đúng mẫu: cần cột "Tên dạng bài" (mẫu mới: Phần | Câu | Kiểu | Lớp | Chủ đề | Mức độ | Tên dạng bài | Mã câu hỏi)',
      );
    }

    // Bảng tra chủ đề theo tên (+ lớp) để gán topicId
    const allTopics = await this.prisma.topic.findMany({ where: { bankId: bank.id } });
    const topicByName = new Map<string, string>();
    for (const t of allTopics) {
      topicByName.set(`${String(t.grade ?? '')}|${t.name}`, t.id);
      if (!topicByName.has(`|${t.name}`)) topicByName.set(`|${t.name}`, t.id);
    }

    const slots: any[] = [];
    let currentType: string | null = null;
    for (let r = headIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const get = (i: number) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');
      const phan = get(cPhan);
      const kieu = get(cKieu);
      const lop = get(cLop);
      const chuDe = get(cChuDe);
      const form = get(cForm);
      const muc = get(cMuc);
      const ma = get(cMa);
      if (!phan && !kieu && !form && !muc && !ma && !lop && !chuDe) continue;
      if (phan) {
        const t = ExamsService.MATRIX_TYPE_BY_KEY[phan.toLowerCase()];
        if (t) currentType = t;
      }
      const type =
        (kieu && ExamsService.MATRIX_TYPE_BY_KEY[kieu.toLowerCase()]) ||
        currentType ||
        'ESSAY';
      if (phan && !kieu && !form && !muc && !ma && !lop && !chuDe) continue; // dòng chỉ có tên phần
      const difficulty = muc
        ? ExamsService.MATRIX_DIFF_BY_KEY[muc.toLowerCase()] || null
        : null;
      const grade = lop ? String(lop).replace(/[^0-9]/g, '') : '';
      const topicId = chuDe
        ? topicByName.get(`${grade}|${chuDe}`) || topicByName.get(`|${chuDe}`) || null
        : null;
      slots.push({
        type,
        form,
        difficulty,
        grade: ['10', '11', '12'].includes(grade) ? grade : '',
        topicId,
        questionId: null,
        code: ma || null,
      });
    }
    if (!slots.length) {
      throw new BadRequestException('File không chứa dòng ma trận nào');
    }

    // Giải mã "Mã câu hỏi" → câu hỏi trong ngân hàng
    const codes = slots.map((s) => s.code).filter(Boolean);
    const byCode = new Map<string, any>();
    if (codes.length) {
      const qs = await this.prisma.question.findMany({
        where: { code: { in: codes }, bankId: bank.id },
      });
      qs.forEach((q) => byCode.set(q.code, q));
    }
    const matched: any[] = [];
    const unmatched: string[] = [];
    for (const s of slots) {
      if (s.code) {
        const q = byCode.get(s.code);
        if (q) {
          s.questionId = q.id;
          matched.push(q);
        } else {
          unmatched.push(s.code);
        }
      }
    }

    const parts: { type: string; count: number }[] = [];
    for (const s of slots) {
      const last = parts[parts.length - 1];
      if (last && last.type === s.type) last.count++;
      else parts.push({ type: s.type, count: 1 });
    }

    return { parts, slots, matched, unmatched };
  }

  // Xuất ma trận ra file Excel — 8 cột đúng cấu trúc mới
  async exportMatrixExcel(teacherId: string, body: { name: string; slots: any[] }) {
    const name = String(body?.name || 'Ma trận đề').slice(0, 100);
    const slots: any[] = body?.slots || [];
    const bank = await this.getBank(teacherId);
    const topics = await this.prisma.topic.findMany({ where: { bankId: bank.id } });
    const topicNameById = new Map(topics.map((t) => [t.id, t.name]));
    const typeKey: Record<string, string> = {
      MCQ: 'TN',
      TRUE_FALSE: 'Đ/S',
      SHORT_ANSWER: 'TLN',
      ESSAY: 'TL',
    };
    const phanKey: Record<string, string> = {
      MCQ: 'Trắc nghiệm',
      TRUE_FALSE: 'Đúng/sai',
      SHORT_ANSWER: 'Trả lời ngắn',
      ESSAY: 'Tự luận',
    };
    const diffKey: Record<string, string> = {
      NHAN_BIET: '1',
      THONG_HIEU: '2',
      VAN_DUNG: '3',
      VAN_DUNG_CAO: '4',
    };
    const rows: any[][] = [
      ['Phần', 'Câu', 'Kiểu', 'Lớp', 'Chủ đề', 'Mức độ', 'Tên dạng bài', 'Mã câu hỏi'],
    ];
    let lastPhan = '';
    slots.forEach((s: any, i: number) => {
      const phan = phanKey[s.type] || 'Tự luận';
      const topicName = s.topicId
        ? topicNameById.get(s.topicId) || ''
        : s.topicName || '';
      rows.push([
        phan !== lastPhan ? phan : '',
        i + 1,
        typeKey[s.type] || 'TL',
        s.grade || '',
        topicName,
        diffKey[s.difficulty] || '',
        s.form || '',
        s.question?.code || s.code || '',
      ]);
      lastPhan = phan;
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 15 },
      { wch: 6 },
      { wch: 8 },
      { wch: 8 },
      { wch: 28 },
      { wch: 10 },
      { wch: 30 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ma trận đề');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return { buffer, filename: `${name}.xlsx` };
  }

  // File mẫu ma trận (8 cột mới) cho giáo viên tải về điền
  async exportMatrixTemplate(): Promise<{ buffer: Buffer; filename: string }> {
    const rows: any[][] = [
      ['Phần', 'Câu', 'Kiểu', 'Lớp', 'Chủ đề', 'Mức độ', 'Tên dạng bài', 'Mã câu hỏi'],
      ['Trắc nghiệm', 1, 'TN', '12', 'Hàm số', '1', 'Hàm số và ứng dụng', ''],
      ['Trắc nghiệm', 2, 'TN', '12', 'Hàm số', '2', 'Hàm số và ứng dụng', ''],
      ['Đúng/sai', 3, 'Đ/S', '12', 'Hình học không gian', '1', 'Tọa độ trong không gian', ''],
      ['Trả lời ngắn', 4, 'TLN', '12', 'Hình học không gian', '3', 'Thể tích khối đa diện', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 15 },
      { wch: 6 },
      { wch: 8 },
      { wch: 8 },
      { wch: 28 },
      { wch: 10 },
      { wch: 30 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ma trận đề');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return { buffer, filename: 'Mau-ma-tran-de.xlsx' };
  }

  async findAll(teacherId: string, query?: any) {
    // Trợ giảng không có kho đề riêng → trả rỗng (không chặn để trang không lỗi)
    if (await this.isAssistantOnly(teacherId)) return [];
    const where: any = {
      teacherId,
      // Ẩn đề luyện tập do học sinh tự tạo (không phải đề của giáo viên)
      OR: [{ source: null }, { source: { not: 'PRACTICE' } }],
      // Mặc định chỉ đề đang dùng; ?archived=1 → danh sách đề đã lưu trữ
      archivedAt: query?.archived === '1' || query?.archived === 'true' ? { not: null } : null,
    };
    // Lọc theo thư mục (bao gồm cả đề trong các thư mục con)
    if (query?.folderId) {
      const all = await this.prisma.examFolder.findMany({
        where: { teacherId },
        select: { id: true, parentId: true },
      });
      const ids = new Set<string>([String(query.folderId)]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of all) {
          if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
            ids.add(f.id);
            grew = true;
          }
        }
      }
      where.folderId = { in: Array.from(ids) };
    }
    return this.prisma.exam.findMany({
      where,
      include: {
        topic: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
        lessons: {
          select: {
            id: true,
            title: true,
            courseId: true,
            course: { select: { id: true, title: true } },
          },
        },
        _count: { select: { items: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============ THƯ MỤC ĐỀ THI (cây mục lục Kho đề thi) ============

  async listFolders(teacherId: string) {
    const folders = await this.prisma.examFolder.findMany({
      where: { teacherId },
      include: {
        _count: { select: { exams: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
    // Số đề tính gộp cả thư mục con
    const childrenOf = new Map<string, string[]>();
    for (const f of folders) {
      if (!f.parentId) continue;
      if (!childrenOf.has(f.parentId)) childrenOf.set(f.parentId, []);
      childrenOf.get(f.parentId)!.push(f.id);
    }
    const totalCount = (id: string, seen: Set<string>): number => {
      if (seen.has(id)) return 0;
      seen.add(id);
      const f = folders.find((x) => x.id === id);
      if (!f) return 0;
      let c = f._count.exams;
      for (const childId of childrenOf.get(id) || []) {
        c += totalCount(childId, seen);
      }
      return c;
    };
    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt,
      examCount: totalCount(f.id, new Set<string>()),
    }));
  }

  async createFolder(teacherId: string, body: { name: string; parentId?: string | null }) {
    const name = String(body?.name || '').trim().slice(0, 120);
    if (!name) throw new BadRequestException('Tên thư mục không được trống');
    const data: any = { teacherId, name };
    if (body?.parentId) {
      const parent = await this.prisma.examFolder.findFirst({
        where: { id: body.parentId, teacherId },
      });
      if (!parent) throw new NotFoundException('Không tìm thấy thư mục cha');
      data.parentId = body.parentId;
    }
    return this.prisma.examFolder.create({ data });
  }

  async updateFolder(
    teacherId: string,
    id: string,
    body: { name?: string; parentId?: string | null },
  ) {
    const folder = await this.prisma.examFolder.findFirst({
      where: { id, teacherId },
    });
    if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
    const data: any = {};
    if (typeof body?.name === 'string') {
      const name = body.name.trim().slice(0, 120);
      if (!name) throw new BadRequestException('Tên thư mục không được trống');
      data.name = name;
    }
    if (body?.parentId !== undefined) {
      if (body.parentId === null || body.parentId === '') {
        data.parentId = null;
      } else {
        if (body.parentId === id) {
          throw new BadRequestException('Không thể đặt thư mục nằm trong chính nó');
        }
        const parent = await this.prisma.examFolder.findFirst({
          where: { id: body.parentId, teacherId },
        });
        if (!parent) throw new NotFoundException('Không tìm thấy thư mục cha');
        // Chống vòng lặp: cha mới không được là con cháu của thư mục này
        const all = await this.prisma.examFolder.findMany({
          where: { teacherId },
          select: { id: true, parentId: true },
        });
        const descendants = new Set<string>();
        const queue = [id];
        while (queue.length) {
          const cur = queue.shift()!;
          for (const f of all) {
            if (f.parentId === cur && !descendants.has(f.id)) {
              descendants.add(f.id);
              queue.push(f.id);
            }
          }
        }
        if (descendants.has(body.parentId)) {
          throw new BadRequestException('Không thể đặt thư mục vào thư mục con của chính nó');
        }
        data.parentId = body.parentId;
      }
    }
    return this.prisma.examFolder.update({ where: { id }, data });
  }

  async deleteFolder(teacherId: string, id: string) {
    const folder = await this.prisma.examFolder.findFirst({
      where: { id, teacherId },
    });
    if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
    // Prisma onDelete: SetNull cho children.parentId và exam.folderId
    return this.prisma.examFolder.delete({ where: { id } });
  }

  // Gán đề thi vào bài giảng → BTVN online cho học sinh
  // (Nhiều bài giảng/khóa học có thể dùng chung một đề)
  async assignToLesson(examId: string, lessonId: string, teacherId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, course: { teacherId } },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { examId },
    });
    return { assigned: true };
  }

  // Cập nhật câu hỏi trong đề (đổi điểm / đổi câu hỏi khác từ ngân hàng)
  async updateItem(
    teacherId: string,
    examId: string,
    itemId: string,
    dto: { score?: number; questionId?: string },
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    // Câu phải thuộc ĐÚNG đề này (trước đây chỉ kiểm tra đề → sửa được câu của đề người khác)
    const item = await this.prisma.examItem.findFirst({ where: { id: itemId, examId } });
    if (!item) throw new NotFoundException('Không tìm thấy câu trong đề');

    const data: any = {};
    if (dto.score !== undefined) {
      const sc = Number(dto.score);
      if (!Number.isFinite(sc) || sc < 0 || sc > 100) {
        throw new BadRequestException('Điểm câu hỏi không hợp lệ');
      }
      data.score = sc;
    }
    if (dto.questionId) {
      const q = await this.prisma.question.findFirst({
        where: { id: dto.questionId, bank: { teacherId } },
      });
      if (!q) throw new NotFoundException('Không tìm thấy câu hỏi trong ngân hàng');
      data.questionId = dto.questionId;
    }

    await this.prisma.examItem.update({ where: { id: itemId }, data });
    await this.regenerateTex(teacherId, examId);
    return { updated: true };
  }

  // Xóa câu hỏi khỏi đề
  async removeItem(teacherId: string, examId: string, itemId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const r = await this.prisma.examItem.deleteMany({ where: { id: itemId, examId } });
    if (!r.count) throw new NotFoundException('Không tìm thấy câu trong đề');
    await this.regenerateTex(teacherId, examId);
    return { deleted: true };
  }

  // Tái sinh texSource + tổng điểm sau khi sửa câu hỏi
  private async regenerateTex(teacherId: string, examId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
      include: {
        items: { include: { question: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!exam) return;
    const texSource = this.generateTex(exam.title, exam.items);
    const totalScore = Math.round(
      exam.items.reduce((s, i) => s + i.score, 0) * 100,
    ) / 100;
    await this.prisma.exam.update({
      where: { id: examId },
      data: { texSource, totalScore },
    });
  }

  async unassignFromLesson(lessonId: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, course: { teacherId } },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { examId: null },
    });
    return { unassigned: true };
  }

  // Sinh mã LaTeX đáp án (kèm lời giải) → PDF tải về
  private generateAnswerTex(examTitle: string, items: any[]): string {
    const lines: string[] = [];
    lines.push('\\documentclass[12pt]{article}');
    lines.push('\\usepackage{ex_test}');
    lines.push('\\usepackage{amsmath}');
    lines.push('\\usepackage{amssymb}');
    lines.push('\\usepackage{amsfonts}');
    lines.push('\\usepackage{mathtools}');
    lines.push('\\usepackage{siunitx}');
    lines.push('\\usepackage{cancel}');
    lines.push('\\usepackage{empheq}');
    lines.push('\\usepackage{systeme}');
    lines.push('\\usepackage{tikz}');
    lines.push('\\usepackage{pgfplots}');
    lines.push('\\pgfplotsset{compat=1.16}');
    lines.push(
      '\\usetikzlibrary{arrows.meta,calc,patterns,patterns.meta,decorations.pathreplacing,decorations.markings,decorations.pathmorphing,decorations.shapes,decorations.text,decorations.fractals,decorations.footprints,angles,quotes,shapes,shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,positioning,fit,matrix,chains,scopes,through,backgrounds,fadings,shadows,mindmap,trees,plotmarks,intersections,3d,perspective,math,spy,automata,er,petri,datavisualization,datavisualization.formats.functions,lindenmayersystems,calendar,folding,graphs,graphs.standard}',
    );
    lines.push('\\usepackage{tkz-base}');
    lines.push('\\usepackage{tkz-tab}');
    lines.push('\\usepackage{tkz-euclide}');
    lines.push('\\usepackage{circuitikz}');
    lines.push('\\usepackage{tikz-cd}');
    lines.push('\\usepackage{tikz-3dplot}');
    lines.push('\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}');
    lines.push('\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}');
    // Macro VN thường gặp trong đề của giáo viên (chỉ thêm nếu chưa có — tránh xung đột ex_test)
    lines.push('\\makeatletter');
    lines.push('\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}');
    lines.push('\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}');
    lines.push('\\@ifundefined{itemch}{\\newenvironment{itemch}{\\begin{itemize}}{\\end{itemize}}}{}');
    lines.push('\\@ifundefined{itemchoice}{\\newenvironment{itemchoice}{\\begin{itemize}}{\\end{itemize}}}{}');
    lines.push('\\makeatother');
    lines.push('\\begin{document}');
    lines.push(
      '\\begin{center}{\\Large ' +
        this.escapeLatex('ĐÁP ÁN — ' + examTitle) +
        '}\\end{center}',
    );
    lines.push('');

    let qIndex = 0;
    for (const item of items) {
      const q = item.question as any;
      qIndex++;
      const typeLabel =
        q.type === 'MCQ'
          ? 'Trắc nghiệm'
          : q.type === 'TRUE_FALSE'
            ? 'Đúng/Sai'
            : q.type === 'SHORT_ANSWER'
              ? 'Trả lời ngắn'
              : 'Tự luận';

      lines.push(`\\noindent\\textbf{Câu ${qIndex}.} (${typeLabel})`);

      if (q.type === 'MCQ') {
        lines.push(`\\noindent\\textbf{Đáp án: ${this.escapeLatex(String(q.answer))}}`);
      } else if (q.type === 'TRUE_FALSE') {
        const ans = q.answer as any;
        const parts = (q.options as any[]) || [];
        const labels: string[] = [];
        parts.forEach((p: any) => {
          labels.push(
            `${this.escapeLatex(String(p.id))} — ${ans?.[p.id] ? 'Đúng' : 'Sai'}`,
          );
        });
        lines.push(
          `\\noindent\\textbf{Đáp án:} ${labels
            .map((l) => this.escapeLatex(l))
            .join('; ')}`,
        );
      } else if (q.type === 'SHORT_ANSWER') {
        lines.push(
          `\\noindent\\textbf{Đáp án:} ${this.escapeLatex(String(q.answer))}`,
        );
      } else {
        lines.push(`\\noindent\\textbf{(Tự luận — giáo viên chấm)}`);
      }

      if (q.solution) {
        lines.push(
          '\\noindent\\textit{Lời giải:} ' + (q.solution || ''),
        );
      }
      lines.push('');
    }

    lines.push('\\end{document}');
    return lines.join('\n');
  }

  async findOne(teacherId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, teacherId },
      include: {
        topic: { select: { id: true, name: true } },
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    return exam;
  }

  /**
   * Xoá / lưu trữ đề.
   * - mode 'archive': ẩn đề khỏi kho và khỏi học sinh, GIỮ NGUYÊN bài làm + điểm.
   * - mode 'delete' : xoá hẳn (kèm toàn bộ bài làm của học sinh).
   * - không truyền mode: đề CHƯA có bài làm → xoá; đã có bài làm → từ chối (409) để
   *   giao diện hỏi giáo viên chọn lưu trữ hay xoá hẳn.
   */
  async remove(teacherId: string, id: string, mode?: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, teacherId },
      include: { _count: { select: { attempts: true } } },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (mode === 'archive') {
      await this.prisma.exam.update({
        where: { id },
        data: { archivedAt: new Date(), status: 'DRAFT', published: false },
      });
      return { archived: true };
    }
    if (mode !== 'delete' && exam._count.attempts > 0) {
      throw new ConflictException(
        `Đề đã có ${exam._count.attempts} lượt làm bài. Chọn "Lưu trữ" để giữ điểm của học sinh, hoặc "Xóa hẳn".`,
      );
    }
    await this.prisma.exam.delete({ where: { id } });
    return { deleted: true };
  }

  // Khôi phục đề đã lưu trữ (về trạng thái Nháp, giáo viên tự công khai lại)
  async restore(teacherId: string, id: string) {
    const r = await this.prisma.exam.updateMany({
      where: { id, teacherId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    if (!r.count) throw new NotFoundException('Không tìm thấy đề đã lưu trữ');
    return { restored: true };
  }

  async getTex(teacherId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (!exam.texSource) {
      throw new NotFoundException('Đề chưa có mã .tex');
    }
    return exam.texSource;
  }

  // Chặn các lệnh TeX nguy hiểm trước khi gửi đi biên dịch (lớp bảo vệ thứ 2,
  // lớp 1 là LaTeX service chạy không shell-escape + openin/openout paranoid).
  private assertSafeTex(tex: string) {
    const bad =
      /\\(?:write18|immediate\s*\\write|openout|openin|directlua|latelua|ShellEscape|pdfshellescape)(?![a-zA-Z])|\\(?:input|include|InputIfFileExists|lstinputlisting|verbatiminput)\s*\{?\s*(?:\/|~|\.\.|\|)|\\read\s*\d/i;
    const m = bad.exec(tex || '');
    if (m) {
      throw new HttpException(
        `Mã LaTeX chứa lệnh không được phép: ${m[0].slice(0, 40)}`,
        400,
      );
    }
  }

  async compileRaw(tex: string): Promise<Buffer> {
    const url = process.env.LATEX_SERVICE_URL || 'http://localhost:8080';
    this.assertSafeTex(tex);

    // Chèn ảnh upload (markdown ![]() / \includegraphics với link /api/uploads/...)
    // → đổi thành \includegraphics cục bộ + gửi ảnh base64 kèm theo
    const { tex: source, images } = await this.attachImages(tex);

    let res: Response;
    try {
      res = await fetch(`${url}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, images }),
      });
    } catch (e) {
      throw new HttpException(
        'Không kết nối được LaTeX service: ' + (e as Error).message,
        503,
      );
    }

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      const raw = String(err.error || 'Compile thất bại');

      // TỰ SỬA 1 LẦN: lỗi "Missing $ inserted" thường do môi trường toán
      // (cases/aligned/matrix...) chưa được bọc $...$ → bọc lại rồi thử lại
      if (/Missing \\\$ inserted|Missing \$ inserted|inserted/i.test(raw)) {
        const fixed = this.sanitizeTexContent(source);
        if (fixed !== source) {
          try {
            const retryRes = await fetch(`${url}/compile`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ source: fixed, images }),
            });
            if (retryRes.ok) return Buffer.from(await retryRes.arrayBuffer());
          } catch (e) {
            /* bỏ qua — rơi xuống báo lỗi gốc */
          }
        }
      }

      throw new HttpException(this.extractTexErrors(raw), 500);
    }

    return Buffer.from(await res.arrayBuffer());
  }

  // ===== BIÊN DỊCH PDF CÓ TỰ ĐỘNG SỬA LỖI LaTeX =====
  // 1) Chuẩn hoá lệnh phổ biến (lq/rq, break/quad, ex_test, dapso, immini…)
  // 2) Nếu TeX báo lỗi → sửa theo log (macro lạ, môi trường lạ, &, ngoặc) và thử lại (tối đa 3 lần)
  // 3) Vẫn lỗi → xuất bản văn bản thuần để PDF luôn ra được
  async compileWithAutoFix(
    input: string,
  ): Promise<{ buffer: Buffer; fixes: string[] }> {
    const fixes: string[] = [];
    const pre = normalizeTex(input);
    let current = pre.tex;
    fixes.push(...pre.fixes);

    let lastError = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buffer = await this.compileRaw(current);
        return { buffer, fixes };
      } catch (e: any) {
        lastError = String(e?.message || e || '');
        // Ghi lại bản LaTeX lỗi để chẩn đoán (không ảnh hưởng người dùng)
        try {
          fs.writeFileSync('/tmp/last-fail-answer.tex', current);
        } catch {
          /* bỏ qua */
        }
        const next = fixFromLog(current, lastError);
        if (next.tex === current || !next.fixes.length) break;
        current = next.tex;
        fixes.push(...next.fixes);
      }
    }

    // Fallback an toàn: bọc trong verbatim → LaTeX không diễn giải bất kỳ lệnh nào
    try {
      let plain = texToPlainText(input);
      plain = plain.replace(/\\end\{verbatim\}/g, '');
      const doc = [
        '\\documentclass[11pt,a4paper]{article}',
        '\\usepackage{vntex}',
        '\\usepackage[margin=1.6cm]{geometry}',
        '\\begin{document}',
        '\\begin{verbatim}',
        plain,
        '\\end{verbatim}',
        '\\end{document}',
      ].join('\n');
      const buffer = await this.compileRaw(doc);
      fixes.push('không sửa được hoàn toàn — đã xuất dạng văn bản thuần');
      return { buffer, fixes };
    } catch (fbErr: any) {
      throw new HttpException(
        'Không xuất được PDF sau khi tự sửa.\n' +
          'Lỗi gốc: ' +
          lastError.slice(0, 300) +
          '\nLỗi bản văn bản thuần: ' +
          String(fbErr?.message || '').slice(0, 300),
        500,
      );
    }
  }

  // Định dạng đáp án sang LaTeX (giữ nguyên công thức $...$)
  private answerToTex(a: any): string {
    if (a === null || a === undefined) return '—';
    if (typeof a === 'string') return a || '—';
    if (typeof a === 'boolean') return a ? 'Đúng' : 'Sai';
    if (Array.isArray(a)) return a.map((x) => this.answerToTex(x)).join(', ');
    if (typeof a === 'object') {
      const anyA = a as any;
      if (typeof anyA.text === 'string') return anyA.text;
      const entries = Object.entries(anyA);
      if (!entries.length) return '—';
      if (entries.every(([, v]) => typeof v === 'boolean')) {
        return entries
          .sort(([x], [y]) =>
            String(x).localeCompare(String(y), undefined, { numeric: true }),
          )
          .map(([, v]) => (v ? 'Đ' : 'S'))
          .join('-');
      }
      return entries
        .map(([k, v]) => `${String(k).toUpperCase()}: ${String(v)}`)
        .join(' · ');
    }
    return String(a);
  }

  // Xuất PDF "ĐÁP ÁN & LỜI GIẢI" của một bài làm (học sinh tự tải lại từ lịch sử)
  async buildAttemptAnswersPdf(
    userId: string,
    examId: string,
    attemptId: string,
  ): Promise<{ buffer: Buffer; filename: string; fixes: string[] }> {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      select: { studentId: true },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm');

    if (attempt.studentId !== userId) {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      // Giáo viên chỉ tải được bài của đề mình hoặc khóa mình trợ giảng; admin tải được hết
      const allowed =
        u?.role === Role.ADMIN ||
        (u?.role === Role.TEACHER && (await this.hasExamAccess(examId, userId)));
      if (!allowed) {
        throw new ForbiddenException('Không có quyền tải đáp án bài làm này');
      }
    }

    const detail: any = await this.getAttemptDetail(
      attempt.studentId,
      examId,
      attemptId,
      // tải PDF không tính là "đã xem 1 lần"; giáo viên luôn thấy đáp án
      { noMarkViewed: true, asTeacher: attempt.studentId !== userId },
    );
    if (attempt.studentId === userId && !detail.answersVisible) {
      throw new ForbiddenException(
        'Đáp án của đề này đang bị khóa (chưa tới thời gian công bố, chưa đủ điểm tối thiểu, hoặc chỉ được xem 1 lần).',
      );
    }
    const stu = await this.prisma.user.findUnique({
      where: { id: attempt.studentId },
      select: { fullName: true, className: true },
    });

    const results: any[] = detail.results || [];
    const joined = results
      .map((r) => String(r.content || '') + String(r.solution || ''))
      .join('\n');
    const hasTikz = /\\begin\{tikzpicture\}/.test(joined);
    const hasTable = /\\begin\{(tabular|tabularx|array)\}/.test(joined);

    const L: string[] = [];
    L.push('\\documentclass[11pt,a4paper]{article}');
    L.push('\\usepackage[utf8]{inputenc}');
    L.push('\\usepackage[T5]{fontenc}');
    L.push('\\usepackage{vntex}');
    L.push('\\usepackage{amsmath,amssymb,amsfonts}');
    L.push('\\usepackage[margin=1.6cm]{geometry}');
    L.push('\\usepackage[shortlabels]{enumitem}');
    L.push('\\usepackage{graphicx}');
    L.push('\\usepackage{colortbl,xcolor}');
    if (hasTable) L.push('\\usepackage{array,booktabs}');
    if (hasTikz) L.push('\\usepackage{tikz}');
    // Định nghĩa sẵn các macro toán Việt Nam hay dùng trong đề
    L.push('\\makeatletter');
    L.push(
      '\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
    );
    L.push(
      '\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
    );
    L.push(
      '\\@ifundefined{itemchoice}{\\newenvironment{itemchoice}{\\begin{itemize}}{\\end{itemize}}}{}',
    );
    L.push('\\@ifundefined{itemch}{\\newcommand{\\itemch}{\\item}}{}');
    L.push('\\@ifundefined{itemEX}{\\newcommand{\\itemEX}{\\item}}{}');
    // KHÔNG định nghĩa \True/\False ở đây: bộ tự sửa đã đổi chúng thành "Đúng"/"Sai"
    // trong nội dung, nếu khai báo lại sẽ bị chính bộ sửa ghi đè tên macro.
    L.push('\\makeatother');
    L.push('\\setlength{\\parindent}{0pt}');
    L.push('\\begin{document}');
    L.push('\\begin{center}');
    L.push('{\\Large\\bfseries ĐÁP ÁN \\& LỜI GIẢI}');
    L.push('\\\\[2pt]');
    L.push(`{\\large ${escapeTex(detail.title || 'Đề thi')}}`);
    L.push('\\\\[6pt]');
    L.push(
      `${escapeTex(stu?.fullName || 'Học sinh')}${
        stu?.className ? ' --- Lớp ' + escapeTex(stu.className) : ''
      }`,
    );
    L.push('\\\\[2pt]');
    L.push(`Điểm: \\textbf{${detail.score}/${detail.totalScore}}`);
    if (detail.submittedAt) {
      L.push(
        ` \\quad Nộp lúc: ${new Date(detail.submittedAt).toLocaleString('vi-VN')}`,
      );
    }
    L.push('\\end{center}');
    L.push('\\vspace{8pt}');

    results.forEach((r, i) => {
      L.push(`\\textbf{Câu ${i + 1}.} ${r.content || ''}`);
      const opts: any[] = Array.isArray(r.options) ? r.options : [];
      if (opts.length) {
        L.push('\\begin{itemize}[leftmargin=*]');
        opts.forEach((o, k) => {
          // options có dạng [{id:'A', text:'...'}] hoặc mảng chuỗi
          const text =
            typeof o === 'string' ? o : (o?.text ?? o?.content ?? '');
          const label =
            o && typeof o === 'object' && (o as any).id
              ? String((o as any).id)
              : 'ABCDEFGH'[k] || String(k + 1);
          L.push(`\\item[${label}.] ${text}`);
        });
        L.push('\\end{itemize}');
      }
      L.push(`\\textbf{Đáp án:} ${this.answerToTex(r.correctAnswer)}`);
      L.push(`\\textbf{Bài làm của bạn:} ${this.answerToTex(r.studentAnswer)}`);
      if (r.earned !== null && r.earned !== undefined) {
        L.push(
          `\\textbf{Điểm câu này:} ${r.earned}${r.maxScore ? '/' + r.maxScore : ''}`,
        );
      }
      if (r.solution) {
        L.push(`\\\\[2pt]\\textbf{Lời giải:}\\ ${r.solution}`);
      }
      L.push('\\vspace{6pt}');
      L.push('\\hrule');
      L.push('\\vspace{8pt}');
    });

    L.push('\\end{document}');

    const { buffer, fixes } = await this.compileWithAutoFix(L.join('\n'));
    const filename = `dap-an-${safeFilename(detail.title || 'de-thi')}-${String(
      attemptId,
    ).slice(-6)}.pdf`;
    return { buffer, filename, fixes };
  }

  // Quét ảnh đã upload trong mã LaTeX → chuyển thành \includegraphics + danh sách base64
  private async attachImages(
    tex: string,
  ): Promise<{ tex: string; images: { name: string; data: string }[] }> {
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads');
    const images: { name: string; data: string }[] = [];
    let out = tex || '';

    const toIncludegraphics = (filename: string): string => {
      const file = path.join(uploadDir, filename);
      if (!fs.existsSync(file)) return '';
      images.push({
        name: filename,
        data: fs.readFileSync(file).toString('base64'),
      });
      return `\\includegraphics[width=0.8\\linewidth,keepaspectratio]{${filename}}`;
    };

    // 1) Markdown: ![alt](/api/uploads/xxx.png) hoặc ![](/uploads/xxx.png)
    out = out.replace(
      /!\[[^\]]*\]\(\s*(\/api)?\/uploads\/([A-Za-z0-9._-]+)\s*\)/g,
      (m, _prefix: string, filename: string) =>
        toIncludegraphics(filename) || m,
    );

    // 2) \includegraphics[opts]{/api/uploads/xxx} hoặc {/uploads/xxx}
    out = out.replace(
      /\\includegraphics(\[[^\]]*\])?\{\s*(\/api)?\/uploads\/([A-Za-z0-9._-]+)\s*\}/g,
      (m, opts: string, _prefix: string, filename: string) => {
        const replacement = toIncludegraphics(filename);
        if (!replacement) return m;
        // Nếu người dùng đã có options thì giữ lại
        if (opts) {
          return replacement.replace(
            /\[width=0\.8\\linewidth,keepaspectratio\]/,
            opts,
          );
        }
        return replacement;
      },
    );

    return { tex: out, images };
  }

  // Trích các dòng lỗi quan trọng từ log TeX: dòng "!" + dòng "l.<số>" (vị trí lỗi)
  private extractTexErrors(log: string): string {
    const lines = String(log || '').split('\n');
    const important: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('!')) {
        important.push(line);
        // Kèm dòng "l.<số>" gần đó (dòng nguồn bị lỗi)
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const next = lines[j].trim();
          if (next.startsWith('l.')) {
            important.push(next);
            break;
          }
        }
      }
    }
    if (important.length) {
      return (
        'Lỗi LaTeX:\n' +
        important.join('\n') +
        '\n\n(Gợi ý: kiểm tra dấu ngoặc { } có cân bằng trong công thức toán không)'
      );
    }
    return log.slice(-800);
  }

  // Preamble chuẩn cho đề thi (hỗ trợ ex_test + TikZ + tiếng Việt)
  private buildPreamble(): string {
    return [
      '\\documentclass[12pt]{article}',
      '\\usepackage{ex_test}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      '\\usepackage{amsfonts}',
      '\\usepackage{mathtools}',
      '\\usepackage{siunitx}',
      '\\usepackage{cancel}',
      '\\usepackage{empheq}',
      '\\usepackage{systeme}',
      '\\usepackage{graphicx}',
      '\\usepackage{tikz}',
      '\\usepackage{pgfplots}',
      '\\pgfplotsset{compat=1.16}',
      '\\usepgfplotslibrary{fillbetween,polar,colormaps,statistics,dateplot,groupplots,units,patchplots,ternary}',
      '\\usetikzlibrary{arrows.meta,calc,patterns,patterns.meta,decorations.pathreplacing,decorations.markings,decorations.pathmorphing,decorations.shapes,decorations.text,decorations.fractals,decorations.footprints,angles,quotes,shapes,shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,positioning,fit,matrix,chains,scopes,through,backgrounds,fadings,shadows,mindmap,trees,plotmarks,intersections,3d,perspective,math,spy,automata,er,petri,datavisualization,datavisualization.formats.functions,lindenmayersystems,calendar,folding,graphs,graphs.standard}',
      '\\usepackage{tkz-base}',
      '\\usepackage{tkz-tab}',
      '\\usepackage{tkz-euclide}',
      '\\usepackage{circuitikz}',
      '\\usepackage{tikz-cd}',
      '\\usepackage{tikz-3dplot}',
      '\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}',
      '\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}',
      '\\makeatletter',
      '\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
      '\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
      '\\makeatother',
      '\\begin{document}',
    ].join('\n');
  }

  // Biên dịch thử "thông minh": nếu chưa có documentclass thì tự bọc preamble đầy đủ
  async compileSmart(tex: string): Promise<Buffer> {
    let source = (tex || '').trim();
    if (!source) {
      throw new HttpException('Không có nội dung LaTeX', 400);
    }
    // Nếu là snippet (chưa có \documentclass) → bọc preamble tự động
    if (!source.includes('\\documentclass')) {
      source = this.buildPreamble() + '\n' + source + '\n\\end{document}';
    } else if (
      !source.includes('vntex') &&
      !source.includes('ex_test') &&
      !source.includes('T5')
    ) {
      // Tài liệu người dùng tự viết: tự chèn gói tiếng Việt sau \documentclass
      source = source.replace(
        /(\\documentclass(?:\[[^\]]*\])?\{[^}]*\})/,
        '$1\n\\usepackage{vntex}',
      );
    }
    return this.compileRaw(source);
  }

  // Dựng danh sách gói LaTeX cho 1 đoạn TikZ/văn bản.
  // Chỉ nạp gói NẶNG khi snippet thực sự dùng → giữ tốc độ biên dịch nhanh.
  private snippetPackages(s: string): string[] {
    const p: string[] = [
      '\\usepackage[dvipsnames,svgnames,x11names,table]{xcolor}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      '\\usepackage{amsfonts}',
      '\\usepackage{vntex}',
      '\\usepackage{array}',
      '\\usepackage{booktabs}',
      '\\usepackage{colortbl}',
      '\\usepackage{graphicx}',
      '\\usepackage[shortlabels]{enumitem}',
      '\\usepackage{tikz}',
      '\\usetikzlibrary{arrows,arrows.meta,calc,patterns,patterns.meta,decorations.pathreplacing,decorations.markings,decorations.pathmorphing,decorations.shapes,angles,quotes,shapes,shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,positioning,fit,matrix,chains,scopes,through,backgrounds,fadings,shadows,mindmap,trees,plotmarks,intersections,3d,perspective,math,spy,automata,er,petri,datavisualization,datavisualization.formats.functions,lindenmayersystems,calendar,folding,graphs,graphs.standard}',
    ];

    // ex_test: bộ macro của giáo viên VN (\IntervalLR, \IntervalGRF, enumEX, \dapso...).
    // LƯU Ý 1: ex_test tự nạp vntex → nếu vẫn giữ \usepackage{vntex} sẽ lỗi
    //   "Command \ifoptenc already defined" → gỡ vntex.
    // LƯU Ý 2: ex_test phải nạp TRƯỚC enumitem/xcolor/tikz, nếu không các môi trường
    //   của nó (listEX/enumEX) sẽ hỏng ("Undefined control sequence" ở \end{listEX}).
    if (/\\Interval(LR|GRF?|LRF?)\b|\\dapso\b|\\dsh\b|\\itemEX\b|\\begin\{(?:enum|list)EX\}/.test(s)) {
      const vi = p.indexOf('\\usepackage{vntex}');
      if (vi >= 0) p.splice(vi, 1);
      p.unshift('\\usepackage{ex_test}');
    }

    // mathtools (chỉ khi dùng các macro mở rộng)
    if (/\\coloneqq|\\DeclarePairedDelimiter|\\mathclap|\\smashoperator|\\cramped|\\xmathstrut/.test(s)) {
      p.splice(4, 0, '\\usepackage{mathtools}');
    }
    // tkz-* (hình học/khảo sát hàm — nặng, chỉ khi dùng)
    if (/\\tkz|tkz-/.test(s)) {
      p.push('\\usepackage{tkz-base}', '\\usepackage{tkz-tab}', '\\usepackage{tkz-euclide}');
    }

    // Gói NẶNG — chỉ nạp khi có dấu hiệu sử dụng
    if (/\\begin\{axis|\addplot|\\pgfplots|\\begin\{(polar|semilog|loglog)axis\}|smithchart/.test(s)) {
      p.push(
        '\\usepackage{pgfplots}',
        '\\pgfplotsset{compat=1.16}',
        '\\usepgfplotslibrary{fillbetween,polar,colormaps,statistics,dateplot,groupplots,units,patchplots,ternary}',
      );
    }
    if (/circuitikz/.test(s)) p.push('\\usepackage{circuitikz}');
    if (/tikzcd/.test(s)) p.push('\\usepackage{tikz-cd}');
    if (/tdplotset|\\tdplot|tikz-3dplot/.test(s)) p.push('\\usepackage{tikz-3dplot}');
    if (/forest/.test(s)) p.push('\\usepackage{forest}');
    if (/smartdiagram/.test(s)) p.push('\\usepackage{smartdiagram}');
    if (/tcolorbox/.test(s)) p.push('\\usepackage[skins,breakable,raster,hooks]{tcolorbox}');
    if (/\\SI\{|\\si\{|\\num\{/.test(s)) p.push('\\usepackage{siunitx}');
    if (/\\cancel/.test(s)) p.push('\\usepackage{cancel}');
    if (/empheq/.test(s)) p.push('\\usepackage{empheq}');
    if (/\\systeme/.test(s)) p.push('\\usepackage{systeme}');
    if (/\\multirow/.test(s)) p.push('\\usepackage{multirow}');
    if (/\\begin\{multicols?\}/.test(s)) p.push('\\usepackage{multicol}');
    if (/tabularx/.test(s)) p.push('\\usepackage{tabularx}');
    if (/longtable/.test(s)) p.push('\\usepackage{longtable}');
    if (/\\llbracket|\\shortrightarrow|stmaryrd/.test(s)) p.push('\\usepackage{stmaryrd}');
    if (/\\wasysym|\\CheckedBox|\\Square/.test(s)) p.push('\\usepackage{wasysym}');
    if (/\\ding\{/.test(s)) p.push('\\usepackage{pifont}');

    p.push(
      '\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}',
      '\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}',
    );
    return p;
  }

  // Biên dịch riêng một block TikZ → PNG cắt đúng kích thước hình
  // Cache 3 tầng: RAM → ĐĨA (sống sót qua restart, dùng chung mọi người dùng) → biên dịch
  async compileTikzSnippet(snippet: string, opts?: { persist?: boolean }): Promise<Buffer> {
    // Chuẩn hoá mũi tên viết sai \<- / \-> / \<-\> → <- / -> / <-> (hay gặp khi copy từ Word)
    const s = (snippet || '')
      .trim()
      .replace(/\\</g, '<')
      .replace(/\\>/g, '>');
    if (!s) throw new HttpException('Không có nội dung TikZ', 400);

    const hash = createHash('md5').update(s).digest('hex');

    // 1. RAM cache
    const cached = this.tikzPngCache.get(hash);
    if (cached) return cached;

    // 2. Đĩa cache — ảnh đã biên dịch trước đó (kể cả từ lần chạy trước)
    const pngPath = path.join(TIKZ_DIR, hash + '.png');
    if (fs.existsSync(pngPath)) {
      const buf = fs.readFileSync(pngPath);
      this.tikzPngCache.set(hash, buf);
      return buf;
    }

    // 3. Biên dịch lần đầu → lưu đĩa để dùng lại vĩnh viễn
    // Tự nhận diện: bảng biến thiên (tikz/tkz-tab) hay bảng dữ liệu (tabular)
    // Cả 2 đều nạp vntex để hiển thị tiếng Việt
    const isTabular = s.startsWith('\\begin{tabular');
    const packages = isTabular
      ? [
          '\\documentclass[border=4pt]{standalone}',
          '\\usepackage{amsmath}',
          '\\usepackage{amssymb}',
          '\\usepackage{vntex}',
          '\\usepackage{array}',
          '\\usepackage{booktabs}',
          '\\usepackage{colortbl}',
        ]
      : [
          '\\documentclass[border=4pt]{standalone}',
          ...this.snippetPackages(s),
        ];
    const source = [
      ...packages,
      '\\begin{document}',
      s,
      '\\end{document}',
    ].join('\n');

    const pdf = await this.compileRaw(source);
    // PDF → PNG (độ phân giải 2x cho nét)
    const png = await this.pdfToPng(pdf);

    // Chỉ lưu đĩa vĩnh viễn khi giáo viên biên dịch (nội dung đề thật); học sinh chỉ dùng
    // bộ nhớ đệm RAM — tránh ai đó gửi hàng loạt hình rác làm đầy ổ đĩa.
    try {
      if (opts?.persist === false) throw new Error('skip-persist');
      fs.mkdirSync(TIKZ_DIR, { recursive: true });
      fs.writeFileSync(pngPath, png);
      // Lưu kèm mã nguồn để debug / biên dịch lại nếu cần
      fs.writeFileSync(path.join(TIKZ_DIR, hash + '.tex'), s);
    } catch (e) {
      // Lỗi ghi đĩa không chặn việc trả ảnh
      if ((e as Error).message !== 'skip-persist') {
        console.warn('Không ghi được cache tikz:', (e as Error).message);
      }
    }


    // Giới hạn cache 200 hình (xóa hình cũ nhất khi đầy)
    if (this.tikzPngCache.size >= 200) {
      const firstKey = this.tikzPngCache.keys().next().value;
      if (firstKey) this.tikzPngCache.delete(firstKey);
    }
    this.tikzPngCache.set(hash, png);

    return png;
  }

  // Biên dịch 1 CÔNG THỨC toán (KaTeX không render được) → PNG bằng TeX Live
  // Dùng cho chế độ dự phòng trên web: hỗ trợ mọi macro mà TeX Live hiểu
  async compileMathSnippet(latex: string): Promise<Buffer> {
    const s = String(latex || '')
      .trim()
      .replace(/\\</g, '<')
      .replace(/\\>/g, '>');
    if (!s) throw new HttpException('Không có công thức', 400);

    // Bọc math mode nếu chưa có. Môi trường display (align/gather/eqnarray)
    // → chuyển sang aligned/gathered trong $...$ (standalone không nhận align trần)
    const disp = s.match(/^\\begin\{(align|gather|eqnarray)\*?\}/);
    let body: string;
    if (disp) {
      const inner = s
        .replace(/^\\begin\{[^}]+\}/, '')
        .replace(/\\end\{[^}]+\}\s*$/, '');
      const env = disp[1] === 'gather' ? 'gathered' : 'aligned';
      body = `$\\begin{${env}}${inner}\\end{${env}}$`;
    } else {
      body = `$${s}$`;
    }

    const hash = createHash('md5').update('math:' + s).digest('hex');

    const cached = this.tikzPngCache.get(hash);
    if (cached) return cached;

    const pngPath = path.join(TIKZ_DIR, hash + '.png');
    if (fs.existsSync(pngPath)) {
      const buf = fs.readFileSync(pngPath);
      this.tikzPngCache.set(hash, buf);
      return buf;
    }

    const source = [
      '\\documentclass[border=3pt]{standalone}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      '\\usepackage{vntex}',
      '\\usepackage{tikz}',
      '\\usepackage{pgfplots}',
      '\\pgfplotsset{compat=1.16}',
      '\\usetikzlibrary{arrows.meta,calc,patterns,decorations.pathreplacing,decorations.markings,angles,quotes,shapes.geometric,intersections}',
      '\\usepackage{tkz-base}',
      '\\usepackage{tkz-tab}',
      '\\usepackage{tkz-euclide}',
      '\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}',
      '\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}',
      '\\makeatletter',
      '\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
      '\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
      '\\makeatother',
      '\\begin{document}',
      body,
      '\\end{document}',
    ].join('\n');

    const pdf = await this.compileRaw(source);
    const png = await this.pdfToPng(pdf);

    try {
      fs.mkdirSync(TIKZ_DIR, { recursive: true });
      fs.writeFileSync(pngPath, png);
    } catch (e) {
      console.warn('Không ghi được cache math:', (e as Error).message);
    }

    if (this.tikzPngCache.size >= 300) {
      const firstKey = this.tikzPngCache.keys().next().value;
      if (firstKey) this.tikzPngCache.delete(firstKey);
    }
    this.tikzPngCache.set(hash, png);

    return png;
  }

  // Biên dịch 1 ĐOẠN LaTeX dạng VĂN BẢN (enumerate/center/itemize/itemchoice...) → PNG
  // Dùng cho chế độ dự phòng trên web: mọi môi trường LaTeX đều chạy bằng TeX Live.
  async compileLatexSnippet(fragment: string): Promise<Buffer> {
    const s = String(fragment || '')
      .trim()
      .replace(/\\</g, '<')
      .replace(/\\>/g, '>');
    if (!s) throw new HttpException('Không có nội dung LaTeX', 400);

    const hash = createHash('md5').update('latex:' + s).digest('hex');
    const cached = this.tikzPngCache.get(hash);
    if (cached) return cached;

    const pngPath = path.join(TIKZ_DIR, hash + '.png');
    if (fs.existsSync(pngPath)) {
      const buf = fs.readFileSync(pngPath);
      this.tikzPngCache.set(hash, buf);
      return buf;
    }

    const source = [
      '\\documentclass[varwidth=18cm,border=4pt]{standalone}',
      ...this.snippetPackages(s),
      '\\makeatletter',
      '\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
      '\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
      '\\@ifundefined{itemchoice}{\\newenvironment{itemchoice}{\\begin{itemize}}{\\end{itemize}}}{}',
      '\\@ifundefined{itemch}{\\newcommand{\\itemch}{\\item}}{}',
      '\\makeatother',
      '\\begin{document}',
      s,
      '\\end{document}',
    ].join('\n');

    const pdf = await this.compileRaw(source);
    const png = await this.pdfToPng(pdf);

    try {
      fs.mkdirSync(TIKZ_DIR, { recursive: true });
      fs.writeFileSync(pngPath, png);
    } catch (e) {
      console.warn('Không ghi được cache latex:', (e as Error).message);
    }

    if (this.tikzPngCache.size >= 300) {
      const firstKey = this.tikzPngCache.keys().next().value;
      if (firstKey) this.tikzPngCache.delete(firstKey);
    }
    this.tikzPngCache.set(hash, png);

    return png;
  }

  async compile(teacherId: string, id: string) {
    let tex = await this.getTex(teacherId, id);
    tex = this.patchHevaDefinition(tex);
    tex = this.fixInvalidMathDelims(tex);
    const pdf = await this.compileRaw(tex);
    const pdfUrl = `/api/exams/${id}/pdf`;
    await this.prisma.exam.update({
      where: { id },
      data: { pdfUrl },
    });
    return pdf;
  }

  // Bỏ \[ \] xuất hiện BÊN TRONG $...$ (không hợp lệ → lỗi "Bad math environment delimiter")
  private fixInvalidMathDelims(tex: string): string {
    let out = '';
    let inMath = false;
    let i = 0;
    while (i < tex.length) {
      const ch = tex[i];
      if (ch === '\\') {
        const next = tex[i + 1];
        if (next === '$') {
          out += '\\$';
          i += 2;
          continue;
        }
        if (inMath && (next === '[' || next === ']')) {
          i += 2; // bỏ \[ hoặc \] trong math
          continue;
        }
        out += ch + (next ?? '');
        i += 2;
        continue;
      }
      if (ch === '$') {
        if (tex[i + 1] === '$') {
          out += '$$';
          i += 2;
          inMath = !inMath;
          continue;
        }
        inMath = !inMath;
        out += '$';
        i++;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  // Sửa định nghĩa \heva trong .tex nguồn: bỏ $ thừa
  // (câu hỏi luôn dùng $\heva{...}$ trong math mode, nếu macro tự bọc $...$ sẽ lỗi "Missing $ inserted")
  private patchHevaDefinition(tex: string): string {
    let out = String(tex || '');
    // Chuẩn hoá mũi tên viết sai \<- / \-> / \<-\> → <- / -> / <-> (copy từ Word)
    out = out.replace(/\\</g, '<').replace(/\\>/g, '>');
    // Chuẩn hoá \heva để dùng được CẢ trong và ngoài math mode (\ifmmode)
    const IFMMODE =
      '\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}';
    out = out.replace(
      /\\newcommand\{\\heva\}\[1\]\{\$\\left\\\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\$\}/g,
      '\\newcommand{\\heva}[1]{' + IFMMODE + '}',
    );
    out = out.replace(
      /\\renewcommand\{\\heva\}\[1\]\{\$\\left\\\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\$\}/g,
      '\\renewcommand{\\heva}[1]{' + IFMMODE + '}',
    );
    out = out.replace(
      /\\providecommand\{\\heva\}\[1\]\{\\left\\\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\}/g,
      '\\providecommand{\\heva}[1]{' + IFMMODE + '}',
    );
    out = out.replace(
      /\\newcommand\{\\heva\}\[1\]\{\\left\\\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\}/g,
      '\\newcommand{\\heva}[1]{' + IFMMODE + '}',
    );

    // Chuẩn hoá \hoac ("hoặc" VN) — dùng ngoặc vuông [
    const IFMMODE_HOAC =
      '\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}';
    out = out.replace(
      /\\newcommand\{\\hoac\}\[1\]\{\$\\left\\\[\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\$\}/g,
      '\\newcommand{\\hoac}[1]{' + IFMMODE_HOAC + '}',
    );
    out = out.replace(
      /\\renewcommand\{\\hoac\}\[1\]\{\$\\left\\\[\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\$\}/g,
      '\\renewcommand{\\hoac}[1]{' + IFMMODE_HOAC + '}',
    );
    out = out.replace(
      /\\providecommand\{\\hoac\}\[1\]\{\\left\\\[\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\}/g,
      '\\providecommand{\\hoac}[1]{' + IFMMODE_HOAC + '}',
    );
    out = out.replace(
      /\\newcommand\{\\hoac\}\[1\]\{\\left\\\[\{\\begin\{aligned\}#1\\end\{aligned\}\\right\.\}/g,
      '\\newcommand{\\hoac}[1]{' + IFMMODE_HOAC + '}',
    );

    // Bổ sung \provideenvironment (không có trong LaTeX chuẩn, thường gặp trong đề của GV)
    if (out.includes('\\provideenvironment')) {
      out = out.replace(
        /(\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*)/,
        '$1\n\\makeatletter\\@ifundefined{provideenvironment}{\\providecommand{\\provideenvironment}[3]{\\@ifundefined{#1}{\\newenvironment{#1}{#2}{#3}}{}}}{}\\makeatother\n',
      );
    }
    // Bổ sung \wideparen (cung tròn rộng — từ gói yhmath, không có trong LaTeX chuẩn)
    if (out.includes('\\wideparen')) {
      out = out.replace(
        /(\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*)/,
        '$1\n\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}\n',
      );
    }
    // Bổ sung pgfplots khi đề dùng \begin{axis}/\addplot
    if (out.includes('\\begin{axis}') || out.includes('\\addplot')) {
      out = out.replace(
        /(\\documentclass(?:\[[^\]]*\])?\{[^}]*\}\s*)/,
        '$1\n\\usepackage{pgfplots}\\pgfplotsset{compat=1.16}\n',
      );
    }
    return out;
  }

  // Biên dịch PDF đáp án (kèm lời giải)
  async compileAnswers(teacherId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, teacherId },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const answerTex = this.generateAnswerTex(exam.title, exam.items);
    return this.compileRaw(answerTex);
  }

  // Tải PDF đáp án: giáo viên luôn được; học sinh chỉ sau khi nộp bài
  async downloadAnswersPdf(user: any, examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    if (user.role === Role.STUDENT) {
      const attempt = await this.prisma.examAttempt.findFirst({
        where: { examId, studentId: user.id, submittedAt: { not: null } },
      });
      if (!attempt) {
        throw new ForbiddenException(
          'Hãy hoàn thành bài thi để xem đáp án',
        );
      }

      // ===== Điểm tối thiểu để xem đáp án → chưa đủ điểm thì không tải được PDF đáp án =====
      const minAsg = await this.prisma.assignment.findFirst({
        where: {
          examId,
          minScoreForAnswers: { not: null },
          course: { enrollments: { some: { studentId: user.id } } },
        },
        orderBy: { minScoreForAnswers: 'desc' },
        select: { minScoreForAnswers: true },
      });
      if (minAsg && minAsg.minScoreForAnswers != null) {
        const agg = await this.prisma.examAttempt.aggregate({
          where: { examId, studentId: user.id, submittedAt: { not: null } },
          _max: { score: true },
        });
        const best = agg._max.score ?? 0;
        if (best < minAsg.minScoreForAnswers) {
          throw new ForbiddenException(
            `Bạn cần đạt ít nhất ${minAsg.minScoreForAnswers} điểm để xem đáp án (điểm cao nhất hiện tại: ${best}).`,
          );
        }
      }
    }

    return this.compileAnswers(exam.teacherId, examId);
  }

  // ============ BẢNG ĐIỂM + LỊCH SỬ LÀM BÀI ============

  // Thống kê nâng cao: trung bình, trung vị, độ lệch chuẩn, tứ phân vị, phổ điểm
  private computeStats(scores: number[], totalScore: number) {
    const sorted = [...scores].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((s, v) => s + v, 0);
    const mean = n ? sum / n : 0;
    const median = n
      ? n % 2 === 1
        ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : 0;
    const variance = n
      ? sorted.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n
      : 0;
    const std = Math.sqrt(variance);

    // Tứ phân vị theo phương pháp nội suy tuyến tính
    const percentile = (p: number): number => {
      if (!n) return 0;
      const pos = (n - 1) * p;
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      if (lo === hi) return sorted[lo];
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
    };
    const q1 = percentile(0.25);
    const q2 = median;
    const q3 = percentile(0.75);

    // Phổ điểm: 10 khoảng đều từ 0 đến totalScore
    const binCount = 10;
    const binSize = totalScore > 0 ? totalScore / binCount : 1;
    const distribution: { label: string; count: number }[] = [];
    for (let i = 0; i < binCount; i++) {
      const from = i * binSize;
      const to = (i + 1) * binSize;
      const isLast = i === binCount - 1;
      const count = sorted.filter((v) =>
        isLast ? v >= from && v <= to + 0.0001 : v >= from && v < to,
      ).length;
      distribution.push({
        label: `${Math.round(from * 10) / 10}–${Math.round(to * 10) / 10}`,
        count,
      });
    }

    return {
      count: n,
      mean: Math.round(mean * 100) / 100,
      median: Math.round(median * 100) / 100,
      std: Math.round(std * 100) / 100,
      q1: Math.round(q1 * 100) / 100,
      q2: Math.round(q2 * 100) / 100,
      q3: Math.round(q3 * 100) / 100,
      min: n ? sorted[0] : 0,
      max: n ? sorted[n - 1] : 0,
      distribution,
    };
  }

  // Bảng điểm của một đề thi (giáo viên) — bao gồm HS chưa nộp + lọc theo lớp
  async getResults(
    teacherId: string,
    examId: string,
    className?: string,
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    // Danh sách học sinh thuộc các khóa học có bài giảng gán đề này
    const enrollments = await this.prisma.enrollment.findMany({
      where: { course: { lessons: { some: { examId } } } },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            className: true,
            school: true,
          },
        },
      },
    });

    // Gộp học sinh duy nhất + lọc theo lớp
    const studentMap = new Map<
      string,
      { id: string; fullName: string; studentCode: string | null; className: string | null; school: string | null }
    >();
    for (const en of enrollments) {
      if (studentMap.has(en.studentId)) continue;
      if (
        className &&
        className.trim() &&
        (en.student.className || '') !== className.trim()
      ) {
        continue;
      }
      studentMap.set(en.studentId, en.student);
    }
    const roster = [...studentMap.values()];

    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        examId,
        submittedAt: { not: null },
        studentId: { in: roster.map((s) => s.id) },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // Lần nộp tốt nhất của từng học sinh
    const bestByStudent = new Map<string, (typeof attempts)[number]>();
    for (const a of attempts) {
      const cur = bestByStudent.get(a.studentId);
      if (!cur || (a.score ?? -1) > (cur.score ?? -1)) {
        bestByStudent.set(a.studentId, a);
      }
    }

    const rows = roster.map((s) => {
      const best = bestByStudent.get(s.id);
      let status: 'DUNG_HAN' | 'MUON' | 'CHUA_NOP';
      let score: number | null = null;
      let submittedAt: Date | null = null;
      let timeSpent: number | null = null;
      if (best) {
        score = best.score;
        submittedAt = best.submittedAt;
        timeSpent = best.timeSpent;
        status = best.late ? 'MUON' : 'DUNG_HAN';
      } else {
        status = 'CHUA_NOP';
      }
      return {
        attemptId: best?.id ?? null,
        studentId: s.id,
        studentName: s.fullName || '—',
        studentCode: s.studentCode || '—',
        school: s.school || '—',
        className: s.className || '—',
        score,
        status,
        timeSpent,
        late: best?.late ?? false,
        submittedAt,
      };
    });

    // Sắp xếp: có điểm (cao → thấp) trước, chưa nộp sau (theo tên)
    rows.sort((a, b) => {
      if (a.score !== null && b.score !== null) return b.score - a.score;
      if (a.score !== null) return -1;
      if (b.score !== null) return 1;
      return a.studentName.localeCompare(b.studentName, 'vi');
    });

    const submittedScores = rows
      .filter((r) => r.score !== null)
      .map((r) => r.score as number);
    const stats = this.computeStats(submittedScores, exam.totalScore);

    // Danh sách lớp để lọc trên giao diện
    const classes = [
      ...new Set(
        enrollments
          .map((e) => e.student.className)
          .filter((c): c is string => !!c && c.trim().length > 0),
      ),
    ].sort((a, b) => a.localeCompare(b, 'vi'));

    return {
      exam: { id: exam.id, title: exam.title, totalScore: exam.totalScore },
      className: className?.trim() || '',
      classes,
      stats: {
        total: rows.length,
        submitted: stats.count,
        notSubmitted: rows.length - stats.count,
        avg: stats.mean,
        median: stats.median,
        std: stats.std,
        q1: stats.q1,
        q2: stats.q2,
        q3: stats.q3,
        max: stats.max,
        min: stats.min,
        distribution: stats.distribution,
      },
      attempts: rows,
    };
  }

  // Xuất đề thi ra Word (.docx) — không gọi AI, không tốn token
  // mathMode: 'omml' = phương trình Word chuẩn | 'tex' = cú pháp TeX để MathType Convert
  async exportDocx(
    teacherId: string,
    examId: string,
    withAnswers: boolean,
    mathMode: 'omml' | 'tex' = 'omml',
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
      include: {
        teacher: { select: { fullName: true, school: true } },
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const { buildExamDocx } = await import('../common/docx.helper');
    const { safeFilename } = await import('../common/export.helper');
    const buffer = await buildExamDocx({
      title: exam.title,
      school: exam.teacher.school || undefined,
      duration: exam.duration,
      grade: exam.grade,
      teacherName: exam.teacher.fullName,
      mathMode,
      items: exam.items.map((it) => ({
        order: it.order,
        part: it.part,
        score: it.score,
        type: it.question.type,
        content: it.question.content,
        options: (it.question.options as any) || null,
        answer: it.question.answer,
        solution: it.question.solution,
      })),
      withAnswers,
    });
    const suffix = mathMode === 'tex' ? '-tex' : '';
    return {
      buffer,
      filename: `${withAnswers ? 'dap-an' : 'de-thi'}${suffix}-${safeFilename(exam.title)}.docx`,
    };
  }

  // Xuất bảng điểm đề thi (PDF qua LaTeX / Excel qua xlsx) — lọc theo lớp
  async exportResults(
    teacherId: string,
    examId: string,
    format: string,
    className?: string,
  ) {
    const data = await this.getResults(teacherId, examId, className);
    const statusLabel = (s: string) =>
      s === 'DUNG_HAN' ? 'Đúng hạn' : s === 'MUON' ? 'Nộp muộn' : 'Chưa nộp';

    const rows = data.attempts.map((a: any, i: number) => ({
      STT: i + 1,
      'Họ và tên': a.studentName,
      'Trường': a.school,
      'Lớp': a.className,
      'Điểm': a.score === null ? '—' : a.score,
      'Trạng thái': statusLabel(a.status),
    }));

    const st = data.stats;
    const classLabel = data.className ? ` — Lớp: ${data.className}` : '';
    const subtitle = `Đề: ${data.exam.title}${classLabel} — Tổng ${data.exam.totalScore} điểm — ${st.total} học sinh (Đã nộp: ${st.submitted}, Chưa nộp: ${st.notSubmitted})`;
    const baseName = safeFilename(
      `bang-diem-${data.exam.title}${data.className ? '-' + data.className : ''}`,
    );

    if (format === 'xlsx') {
      // Sheet 2: thống kê
      const statRows: Record<string, any>[] = [
        { 'Chỉ số': 'Số bài đã nộp', 'Giá trị': st.submitted },
        { 'Chỉ số': 'Chưa nộp', 'Giá trị': st.notSubmitted },
        { 'Chỉ số': 'Điểm trung bình', 'Giá trị': st.avg },
        { 'Chỉ số': 'Điểm trung vị', 'Giá trị': st.median },
        { 'Chỉ số': 'Độ lệch chuẩn', 'Giá trị': st.std },
        { 'Chỉ số': 'Tứ phân vị Q1 (25%)', 'Giá trị': st.q1 },
        { 'Chỉ số': 'Tứ phân vị Q2 (50%)', 'Giá trị': st.q2 },
        { 'Chỉ số': 'Tứ phân vị Q3 (75%)', 'Giá trị': st.q3 },
        { 'Chỉ số': 'Cao nhất', 'Giá trị': st.max },
        { 'Chỉ số': 'Thấp nhất', 'Giá trị': st.min },
      ];
      const distRows = st.distribution.map((d: any) => ({
        'Khoảng điểm': d.label,
        'Số học sinh': d.count,
      }));

      const ws1 = XLSX.utils.json_to_sheet(rows);
      const ws2 = XLSX.utils.json_to_sheet(statRows);
      const ws3 = XLSX.utils.json_to_sheet(distRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Bảng điểm');
      XLSX.utils.book_append_sheet(wb, ws2, 'Thống kê');
      XLSX.utils.book_append_sheet(wb, ws3, 'Phổ điểm');
      return {
        buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        filename: `${baseName}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    // ===== PDF: thống kê + phổ điểm + bảng chi tiết =====
    const tex = [
      '\\documentclass[12pt,a4paper]{article}',
      '\\usepackage{vntex}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      '\\usepackage{longtable}',
      '\\usepackage{geometry}',
      '\\geometry{margin=1.5cm}',
      '\\begin{document}',
      '\\begin{center}',
      '{\\Large\\bfseries BẢNG ĐIỂM BÀI THI} \\\\[4pt]',
      `\\textit{${escapeTex(subtitle)}}`,
      '\\end{center}',
      '\\vspace{6pt}',
      '\\section*{Thống kê}',
      '\\begin{tabular}{|l|c|l|c|}',
      '\\hline',
      `Số bài đã nộp & ${st.submitted} & Chưa nộp & ${st.notSubmitted} \\\\ \\hline`,
      `Điểm trung bình & ${st.avg} & Điểm trung vị & ${st.median} \\\\ \\hline`,
      `Độ lệch chuẩn & ${st.std} & Tứ phân vị Q1 & ${st.q1} \\\\ \\hline`,
      `Tứ phân vị Q2 & ${st.q2} & Tứ phân vị Q3 & ${st.q3} \\\\ \\hline`,
      `Cao nhất & ${st.max} & Thấp nhất & ${st.min} \\\\ \\hline`,
      '\\end{tabular}',
      '\\section*{Phổ điểm}',
      '\\begin{tabular}{|c|c|}',
      '\\hline',
      '\\textbf{Khoảng điểm} & \\textbf{Số học sinh} \\\\ \\hline',
      ...st.distribution.map(
        (d: any) => `${escapeTex(d.label)} & ${d.count} \\\\ \\hline`,
      ),
      '\\end{tabular}',
      '\\section*{Danh sách chi tiết}',
      '\\begin{longtable}{|c|p{4.6cm}|p{3.4cm}|c|c|c|}',
      '\\hline',
      '\\textbf{STT} & \\textbf{Họ và tên} & \\textbf{Trường} & \\textbf{Lớp} & \\textbf{Điểm} & \\textbf{Trạng thái} \\\\ \\hline',
      '\\endfirsthead',
      '\\hline',
      '\\textbf{STT} & \\textbf{Họ và tên} & \\textbf{Trường} & \\textbf{Lớp} & \\textbf{Điểm} & \\textbf{Trạng thái} \\\\ \\hline',
      '\\endhead',
      '\\hline',
      '\\endfoot',
      ...rows.map((r: any) =>
        [
          r.STT,
          r['Họ và tên'],
          r['Trường'],
          r['Lớp'],
          r['Điểm'],
          r['Trạng thái'],
        ]
          .map((c) => escapeTex(String(c)))
          .join(' & ') + ' \\\\ \\hline',
      ),
      '\\end{longtable}',
      '\\end{document}',
    ].join('\n');

    return {
      buffer: await this.compileRaw(tex),
      filename: `${baseName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  // ============ TEMPLATE ĐỀ THI ============

  // Cập nhật meta của đề (title, công khai, template)
  async updateExam(
    teacherId: string,
    id: string,
    dto: {
      title?: string;
      published?: boolean;
      isTemplate?: boolean;
      folderId?: string | null;
      grade?: number | null;
      difficulty?: string | null;
      duration?: number | null;
      topicId?: string | null;
    },
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    const data: any = {};
    if (typeof dto.title === 'string' && dto.title.trim()) {
      data.title = dto.title.trim();
    }
    if (typeof dto.published === 'boolean') {
      data.published = dto.published;
      data.status = dto.published ? 'PUBLISHED' : 'DRAFT';
    }
    if (typeof dto.isTemplate === 'boolean') data.isTemplate = dto.isTemplate;
    if (dto.grade !== undefined) {
      data.grade = dto.grade === null ? null : Number(dto.grade);
    }
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty || null;
    if (dto.duration !== undefined) {
      data.duration = dto.duration === null ? 45 : Number(dto.duration) || 45;
    }
    if (dto.topicId !== undefined) data.topicId = dto.topicId || null;
    if (dto.folderId !== undefined) {
      if (dto.folderId === null || dto.folderId === '') {
        data.folderId = null;
      } else {
        const folder = await this.prisma.examFolder.findFirst({
          where: { id: dto.folderId, teacherId },
        });
        if (!folder) throw new NotFoundException('Không tìm thấy thư mục');
        data.folderId = dto.folderId;
      }
    }
    return this.prisma.exam.update({ where: { id }, data });
  }

  // Tạo đề mới từ template (dùng lại ma trận, bốc câu hỏi mới)
  async createFromTemplate(
    teacherId: string,
    templateId: string,
    title: string,
  ) {
    const template = await this.prisma.exam.findFirst({
      where: { id: templateId, teacherId },
    });
    if (!template) throw new NotFoundException('Không tìm thấy template');
    return this.create(teacherId, {
      title: title || `${template.title} — bản mới`,
      grade: template.grade ?? undefined,
      difficulty: template.difficulty ?? undefined,
      duration: template.duration,
      published: false,
      matrix: template.matrix as any,
    });
  }

  // ============ XEM BÀI LÀM TỪNG HỌC SINH (GIÁO VIÊN) ============

  async reviewAttempt(teacherId: string, examId: string, attemptId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      include: {
        student: {
          select: { id: true, fullName: true, studentCode: true, className: true },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm');

    const answers = (attempt.answers as any) || {};
    const results: any[] = [];
    for (const item of exam.items) {
      const q = item.question as any;
      const stuAns = answers[item.id];
      let correct: boolean | null;
      let earned: number | null;
      let aiScore: number | null = null;
      let aiFeedback: string | null = null;
      let pending = false;
      if (q.type === QuestionType.ESSAY) {
        const graded = stuAns && typeof stuAns === 'object';
        const text = graded ? stuAns.text : stuAns;
        const images = graded && Array.isArray(stuAns.images) ? stuAns.images : [];
        aiScore = graded ? stuAns.aiScore : null;
        aiFeedback = graded ? stuAns.aiFeedback : null;
        const finalScore = graded ? stuAns.finalScore : null;
        const finalComment = graded ? stuAns.finalComment : null;
        const displayScore =
          finalScore !== null && finalScore !== undefined ? finalScore : aiScore;
        pending = displayScore === null || displayScore === undefined;
        correct =
          !pending && displayScore !== null
            ? displayScore >= item.score * 0.5
            : null;
        earned = displayScore;
        results.push({
          itemId: item.id,
          order: item.order,
          type: q.type,
          content: q.content,
          options: q.options,
          correctAnswer: q.answer,
          studentAnswer: text ?? null,
          images,
          correct,
          earned,
          pending,
          aiFeedback,
          finalScore: graded ? stuAns.finalScore : null,
          finalComment: graded ? stuAns.finalComment : null,
          maxScore: item.score,
          solution: q.solution,
        });
        continue;
      }
      if (q.type === QuestionType.TRUE_FALSE) {
        const tf = this.tfFraction(q, stuAns);
        correct = tf.fraction === 1;
        earned = Math.round(item.score * tf.fraction * 100) / 100;
        results.push({
          itemId: item.id,
          order: item.order,
          type: q.type,
          content: q.content,
          options: q.options,
          correctAnswer: q.answer,
          studentAnswer: stuAns ?? null,
          correct,
          earned,
          tfDetail: tf,
          solution: q.solution,
        });
        continue;
      }
      correct = this.gradeQuestion(q, stuAns);
      earned = correct ? item.score : 0;
      results.push({
        itemId: item.id,
        order: item.order,
        type: q.type,
        content: q.content,
        options: q.options,
        correctAnswer: q.answer,
        studentAnswer: stuAns ?? null,
        correct,
        earned,
        solution: q.solution,
      });
    }

    const perPart = (attempt.perPart as any) || {};
    return {
      attemptId,
      examId,
      title: exam.title,
      totalScore: exam.totalScore,
      student: attempt.student,
      score: attempt.score,
      late: attempt.late,
      submittedAt: attempt.submittedAt,
      timeSpent: attempt.timeSpent,
      results,
      aiAnalysis: perPart.aiAnalysis || null,
    };
  }

  // ============ GV CHỐT ĐIỂM CÂU TỰ LUẬN TRONG ĐỀ THI ============

  async reviewEssay(
    teacherId: string,
    examId: string,
    attemptId: string,
    itemId: string,
    dto: { finalScore?: number; finalComment?: string },
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
      include: { items: { where: { id: itemId } } },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    const item = exam.items[0];
    if (!item) throw new NotFoundException('Không tìm thấy câu hỏi');

    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm');

    const answers = (attempt.answers as any) || {};
    const ans = answers[itemId];
    if (!ans || typeof ans !== 'object') {
      throw new NotFoundException('Không tìm thấy câu trả lời của học sinh');
    }

    const finalScore = Math.round(
      Math.max(0, Math.min(item.score, Number(dto.finalScore) || 0)) * 100,
    ) / 100;
    ans.finalScore = finalScore;
    ans.finalComment = dto.finalComment || null;
    answers[itemId] = ans;

    // Tính lại tổng điểm: trừ điểm AI cũ, cộng điểm GV chốt
    const oldAiScore = typeof ans.aiScore === 'number' ? ans.aiScore : 0;
    const newTotal = Math.round(
      ((attempt.score ?? 0) - oldAiScore + finalScore) * 100,
    ) / 100;

    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { answers: answers as any, score: newTotal },
    });

    await this.prisma.notification.create({
      data: {
        userId: attempt.studentId,
        title: '✅ Giáo viên đã chốt điểm câu tự luận',
        body: `Điểm: ${finalScore}/${item.score}. Xem nhận xét của thầy cô trong Lịch sử làm bài.`,
        link: '/student/attempts',
      },
    });

    return { finalScore, totalScore: newTotal };
  }

  // ============ LUYỆN TẬP CÁ NHÂN HÓA (AI) ============

  // Phân tích chủ đề yếu từ các lần làm bài
  private async analyzeWeakTopics(studentId: string) {
    const attempts = await this.prisma.examAttempt.findMany({
      where: { studentId, submittedAt: { not: null } },
      include: {
        exam: {
          include: {
            teacher: { select: { id: true, fullName: true } },
            items: { include: { question: { include: { topic: true } } } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
    if (!attempts.length) return { weakTopics: [], teacher: null };

    const byTopic = new Map<
      string,
      { name: string; wrong: number; total: number }
    >();
    for (const a of attempts) {
      const answers = (a.answers as any) || {};
      for (const item of a.exam.items) {
        const q = item.question as any;
        if (q.type === QuestionType.ESSAY) continue;
        const key = q.topicId || 'unknown';
        const entry = byTopic.get(key) || {
          name: q.topic?.name || 'Chưa phân loại',
          wrong: 0,
          total: 0,
        };
        entry.total++;
        if (!this.gradeQuestion(q, answers[item.id])) entry.wrong++;
        byTopic.set(key, entry);
      }
    }

    const weakTopics = [...byTopic.entries()]
      .map(([topicId, v]) => ({
        topicId: topicId === 'unknown' ? null : topicId,
        name: v.name,
        wrong: v.wrong,
        total: v.total,
        rate: v.total ? v.wrong / v.total : 0,
      }))
      .filter((t) => t.topicId && t.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.rate - a.rate)
      .slice(0, 3);

    const teacher = attempts[0].exam.teacher;
    return { weakTopics, teacher };
  }

  // Gợi ý ôn tập
  async recommendPractice(studentId: string) {
    const { weakTopics, teacher } = await this.analyzeWeakTopics(studentId);
    if (!weakTopics.length) {
      return {
        weakTopics: [],
        available: 0,
        teacher: null,
        message:
          'Chưa có đủ dữ liệu. Hãy làm thêm vài bài thi để hệ thống phân tích!',
      };
    }
    const topicIds = weakTopics.map((t) => t.topicId as string);
    const available = await this.prisma.question.count({
      where: { bank: { teacherId: teacher.id }, topicId: { in: topicIds } },
    });
    return {
      weakTopics,
      available,
      teacher: { id: teacher.id, fullName: teacher.fullName },
      message: '',
    };
  }

  // Tạo đề luyện tập từ chủ đề yếu
  // Helper: tạo đề luyện từ danh sách câu hỏi đã chọn
  private async buildPracticeExam(
    teacherId: string,
    studentId: string,
    title: string,
    picked: any[],
    meta?: { topics?: string[] },
  ) {
    const n = picked.length;
    const totalScore = Math.round(n * 100) / 100;
    return this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          teacherId,
          title,
          published: false,
          duration: Math.max(10, Math.ceil(n * 1.5)),
          totalScore,
          isTemplate: false,
          // Đề do HỌC SINH tự luyện: KHÔNG lưu vào Kho đề thi của giáo viên
          source: 'PRACTICE',
        },
      });
      let order = 1;
      for (const q of picked) {
        await tx.examItem.create({
          data: {
            examId: exam.id,
            questionId: q.id,
            order: order++,
            part: 1,
            score: 1,
          },
        });
      }
      return {
        examId: exam.id,
        title: exam.title,
        count: picked.length,
        topics: meta?.topics || [],
      };
    });
  }

  async createPractice(studentId: string, count: number) {
    const { weakTopics, teacher } = await this.analyzeWeakTopics(studentId);
    if (!teacher) {
      throw new ForbiddenException(
        'Chưa có dữ liệu bài làm để tạo đề luyện tập',
      );
    }
    if (!weakTopics.length) {
      throw new ForbiddenException('Chưa phát hiện chủ đề nào cần luyện tập');
    }
    const topicIds = weakTopics.map((t) => t.topicId as string);
    const pool = await this.prisma.question.findMany({
      where: { bank: { teacherId: teacher.id }, topicId: { in: topicIds } },
    });
    const n = Math.max(1, Math.min(Number(count) || 10, pool.length));
    if (!pool.length) {
      throw new ForbiddenException(
        'Ngân hàng đề chưa có câu hỏi cho các chủ đề này',
      );
    }
    const picked = this.shuffle(pool).slice(0, n);
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    const title = `Luyện tập: ${weakTopics
      .slice(0, 2)
      .map((t) => t.name)
      .join(', ')} — ${student?.fullName || 'HS'}`;

    return this.buildPracticeExam(teacher.id, studentId, title, picked, {
      topics: weakTopics.map((t) => t.name),
    });
  }

  // ============ LUYỆN NHANH THEO CHỦ ĐỀ (HS TỰ CHỌN) ============

  // Danh sách chủ đề khả dụng (từ ngân hàng của GV chính, >= 3 câu)
  async practiceTopics(studentId: string) {
    const { teacher } = await this.analyzeWeakTopics(studentId);
    if (!teacher) {
      return {
        teacher: null,
        topics: [],
        message: 'Chưa có dữ liệu bài làm. Hãy làm 1 bài thi để mở khóa luyện tập.',
      };
    }
    const topics = await this.prisma.topic.findMany({
      where: { bank: { teacherId: teacher.id } },
      include: { _count: { select: { questions: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      teacher: { id: teacher.id, fullName: teacher.fullName },
      topics: topics
        .filter((t) => t._count.questions >= 3)
        .map((t) => ({
          id: t.id,
          name: t.name,
          grade: t.grade,
          count: t._count.questions,
        })),
      message: '',
    };
  }

  // Tạo đề luyện nhanh theo chủ đề đã chọn
  async createQuickPractice(
    studentId: string,
    dto: { topicId?: string; difficulty?: string; count?: number },
  ) {
    const { teacher } = await this.analyzeWeakTopics(studentId);
    if (!teacher) {
      throw new ForbiddenException(
        'Chưa có dữ liệu bài làm. Hãy làm 1 bài thi trước.',
      );
    }
    if (!dto?.topicId) throw new ForbiddenException('Vui lòng chọn chủ đề');

    const topic = await this.prisma.topic.findFirst({
      where: { id: dto.topicId, bank: { teacherId: teacher.id } },
    });
    if (!topic) throw new ForbiddenException('Chủ đề không hợp lệ');

    const where: any = { bank: { teacherId: teacher.id }, topicId: dto.topicId };
    if (dto.difficulty) where.difficulty = dto.difficulty;

    const pool = await this.prisma.question.findMany({ where });
    if (!pool.length) {
      throw new ForbiddenException('Chủ đề này chưa có câu hỏi');
    }
    const n = Math.max(1, Math.min(Number(dto.count) || 10, pool.length));
    const picked = this.shuffle(pool).slice(0, n);
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
    });
    const diffLabel = dto.difficulty ? ` · ${dto.difficulty}` : '';
    const title = `Luyện nhanh: ${topic.name}${diffLabel} — ${student?.fullName || 'HS'}`;

    return this.buildPracticeExam(teacher.id, studentId, title, picked, {
      topics: [topic.name],
    });
  }

  // ============ GIAO BÀI HÀNG LOẠT ============

  // Giao 1 đề cho nhiều khóa học (tạo bài giảng BTVN trong từng khóa)
  async assignBulk(
    teacherId: string,
    examId: string,
    courseIds: string[],
    deadline?: string,
    title?: string,
  ) {
    const exam = await this.prisma.exam.findFirst({
      where: { id: examId, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const ids = [...new Set((courseIds || []).filter(Boolean))];
    if (!ids.length) throw new ForbiddenException('Chưa chọn khóa học nào');

    const courses = await this.prisma.course.findMany({
      where: { id: { in: ids }, teacherId },
    });
    if (courses.length !== ids.length) {
      throw new ForbiddenException('Có khóa học không thuộc quyền của bạn');
    }

    const results: any[] = [];
    for (const course of courses) {
      const order = await this.prisma.lesson.count({
        where: { courseId: course.id },
      });
      const lesson = await this.prisma.lesson.create({
        data: {
          courseId: course.id,
          title: (title || '').trim() || `BTVN: ${exam.title}`,
          examId,
          deadline: deadline ? new Date(deadline) : null,
          order,
        },
      });
      results.push({
        courseId: course.id,
        courseTitle: course.title,
        lessonId: lesson.id,
      });
    }

    return { created: results.length, results };
  }

  // ============ DASHBOARD HỌC SINH ============

  async studentDashboard(studentId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: studentId } });
    if (!user) throw new NotFoundException('Không tìm thấy học sinh');

    const now = new Date();

    // BTVN sắp đến hạn (bài giảng có deadline >= hiện tại, từ khóa học đã đăng ký)
    const upcomingLessons = await this.prisma.lesson.findMany({
      where: {
        deadline: { gte: now },
        course: { enrollments: { some: { studentId } } },
      },
      include: {
        course: { select: { title: true } },
        exam: { select: { id: true, title: true } },
      },
      orderBy: { deadline: 'asc' },
      take: 5,
    });

    // Hoạt động 14 ngày gần nhất (làm bài + hoàn thành bài giảng)
    const since = new Date(now.getTime() - 14 * 86400000);
    const [attempts, progresses] = await Promise.all([
      this.prisma.examAttempt.findMany({
        where: { studentId, submittedAt: { gte: since } },
        select: { submittedAt: true },
      }),
      this.prisma.lessonProgress.findMany({
        where: { studentId, updatedAt: { gte: since }, completed: true },
        select: { updatedAt: true },
      }),
    ]);
    const activeDays = new Set<string>();
    for (const a of attempts) {
      activeDays.add(a.submittedAt.toISOString().slice(0, 10));
    }
    for (const p of progresses) {
      activeDays.add(p.updatedAt.toISOString().slice(0, 10));
    }

    return {
      streakDays: user.streakDays ?? 0,
      xp: user.xp,
      level: user.level,
      upcoming: upcomingLessons.map((l) => ({
        lessonId: l.id,
        courseTitle: l.course.title,
        examId: l.exam?.id ?? null,
        examTitle: l.exam?.title ?? l.title,
        deadline: l.deadline,
      })),
      activeDays: [...activeDays].sort(),
    };
  }

  // Lịch sử làm bài của học sinh
  async myAttempts(studentId: string) {
    const attempts = await this.prisma.examAttempt.findMany({
      where: { studentId, submittedAt: { not: null } },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            duration: true,
            teacher: { select: { fullName: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });
    return attempts.map((a) => ({
      id: a.id,
      examId: a.examId,
      examTitle: a.exam?.title,
      teacherName: (a.exam as any)?.teacher?.fullName || '—',
      totalScore: a.exam?.totalScore ?? 0,
      score: a.score,
      passed:
        a.score !== null && a.exam ? a.score >= a.exam.totalScore * 0.5 : false,
      timeSpent: a.timeSpent,
      submittedAt: a.submittedAt,
    }));
  }

  // Chi tiết một lần làm bài (học sinh xem lại)
  async getAttemptDetail(
    studentId: string,
    examId: string,
    attemptId: string,
    opts?: { noMarkViewed?: boolean; asTeacher?: boolean },
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId, studentId },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm');

    const answers = (attempt.answers as any) || {};
    let score = 0;
    const results: any[] = [];
    for (const item of exam.items) {
      const q = item.question as any;
      const stuAnsRaw = answers[item.id];

      if (q.type === QuestionType.ESSAY) {
        // Câu tự luận: dữ liệu trả về có thể là chuỗi (chưa chấm) hoặc object đã chấm
        const isObj = stuAnsRaw && typeof stuAnsRaw === 'object';
        const text = isObj ? stuAnsRaw.text : stuAnsRaw;
        const images = isObj && Array.isArray(stuAnsRaw.images) ? stuAnsRaw.images : [];
        const aiScore = isObj ? stuAnsRaw.aiScore : null;
        const finalScore = isObj ? stuAnsRaw.finalScore : null;
        const finalComment = isObj ? stuAnsRaw.finalComment : null;
        const displayScore = finalScore !== null && finalScore !== undefined ? finalScore : aiScore;
        if (displayScore !== null && displayScore !== undefined) score += displayScore;
        results.push({
          itemId: item.id,
          order: item.order,
          type: q.type,
          code: q.code || null,
          content: q.content,
          options: q.options,
          correctAnswer: q.answer,
          studentAnswer: text ?? null,
          images,
          correct:
            displayScore !== null && displayScore !== undefined
              ? displayScore >= item.score * 0.5
              : null,
          earned: displayScore,
          pending: displayScore === null || displayScore === undefined,
          aiFeedback: isObj ? stuAnsRaw.aiFeedback : null,
          finalScore: isObj ? stuAnsRaw.finalScore : null,
          finalComment: isObj ? stuAnsRaw.finalComment : null,
          maxScore: item.score,
          solution: q.solution,
        });
        continue;
      }

      if (q.type === QuestionType.TRUE_FALSE) {
        const tf = this.tfFraction(q, stuAnsRaw);
        const correct = tf.fraction === 1;
        const earned = Math.round(item.score * tf.fraction * 100) / 100;
        score += earned;
        results.push({
          maxScore: item.score,
          itemId: item.id,
          order: item.order,
          type: q.type,
          code: q.code || null,
          content: q.content,
          options: q.options,
          correctAnswer: q.answer,
          studentAnswer: stuAnsRaw ?? null,
          correct,
          earned,
          tfDetail: tf,
          solution: q.solution,
        });
        continue;
      }

      const correct = this.gradeQuestion(q, stuAnsRaw);
      const earned = correct ? item.score : 0;
      score += earned;
      results.push({
        maxScore: item.score,
        itemId: item.id,
        order: item.order,
        type: q.type,
        code: q.code || null,
        content: q.content,
        options: q.options,
        correctAnswer: q.answer,
        studentAnswer: stuAnsRaw ?? null,
        correct,
        earned,
        solution: q.solution,
      });
    }

    // Phân tích AI điểm mạnh/yếu (nếu đã chạy xong ở nền)
    const perPart = (attempt.perPart as any) || {};
    const aiAnalysis = perPart.aiAnalysis || null;

    // ===== CỔNG HIỂN THỊ ĐÁP ÁN (Canvas show_correct_answers) =====
    let viewable = opts?.asTeacher ? true : this.canViewAnswers(exam, attempt, false);
    if (viewable && !opts?.asTeacher && (await this.lockedByMinScore(examId, studentId, score))) {
      viewable = false;
    }
    if (!viewable) {
      this.stripAnswers(results);
    } else if (exam.oneTimeResults && !attempt.resultsViewedAt && !opts?.noMarkViewed) {
      // Đánh dấu đã xem 1 lần — lần sau sẽ bị khóa
      this.prisma.examAttempt
        .update({
          where: { id: attemptId },
          data: { resultsViewedAt: new Date() },
        })
        .catch(() => {});
    }

    return {
      attemptId,
      examId,
      title: exam.title,
      totalScore: exam.totalScore,
      score: Math.round(score * 100) / 100,
      submittedAt: attempt.submittedAt,
      timeSpent: attempt.timeSpent,
      results,
      aiAnalysis,
      answersVisible: viewable,
    };
  }

  // GIÁO VIÊN xem chi tiết bài làm của học sinh trong 1 lần thi (để chấm tự luận)
  // Chủ đề thi HOẶC trợ giảng của khóa học có bài tập gắn đề này
  private async hasExamAccess(examId: string, userId: string): Promise<boolean> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { teacherId: true },
    });
    if (!exam) return false;
    if (exam.teacherId === userId) return true;
    const assistant = await this.prisma.courseAssistant.findFirst({
      where: {
        userId,
        course: { assignments: { some: { examId } } },
      },
    });
    return !!assistant;
  }

  async getAttemptDetailForTeacher(
    teacherId: string,
    examId: string,
    attemptId: string,
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (!(await this.hasExamAccess(examId, teacherId))) {
      throw new ForbiddenException('Bạn không có quyền truy cập đề thi này');
    }
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm');

    const answers = (attempt.answers as any) || {};
    let mcqScore = 0;
    let essayMax = 0;
    const results: any[] = [];
    for (const item of exam.items) {
      const q = item.question as any;
      const stuAnsRaw = answers[item.id];

      if (q.type === QuestionType.ESSAY) {
        essayMax += item.score || 0;
        const isObj = stuAnsRaw && typeof stuAnsRaw === 'object';
        const text = isObj ? stuAnsRaw.text : stuAnsRaw;
        const images = isObj && Array.isArray(stuAnsRaw.images) ? stuAnsRaw.images : [];
        const aiScore = isObj ? stuAnsRaw.aiScore : null;
        const finalScore = isObj ? stuAnsRaw.finalScore : null;
        const displayScore =
          finalScore !== null && finalScore !== undefined ? finalScore : aiScore;
        results.push({
          itemId: item.id,
          order: item.order,
          type: q.type,
          code: q.code || null,
          content: q.content,
          studentText: text ?? null,
          images,
          aiScore: displayScore ?? null,
          aiFeedback: isObj ? stuAnsRaw.aiFeedback : null,
          maxScore: item.score,
          solution: q.solution,
        });
        continue;
      }

      if (q.type === QuestionType.TRUE_FALSE) {
        const tf = this.tfFraction(q, stuAnsRaw);
        const earned = Math.round(item.score * tf.fraction * 100) / 100;
        mcqScore += earned;
        results.push({
          itemId: item.id,
          order: item.order,
          type: q.type,
          code: q.code || null,
          content: q.content,
          options: q.options,
          correctAnswer: q.answer,
          studentAnswer: stuAnsRaw ?? null,
          correct: tf.fraction === 1,
          earned,
          solution: q.solution,
        });
        continue;
      }

      const correct = this.gradeQuestion(q, stuAnsRaw);
      const earned = correct ? item.score : 0;
      mcqScore += earned;
      results.push({
        itemId: item.id,
        order: item.order,
        type: q.type,
        code: q.code || null,
        content: q.content,
        options: q.options,
        correctAnswer: q.answer,
        studentAnswer: stuAnsRaw ?? null,
        correct,
        earned,
        solution: q.solution,
      });
    }

    return {
      examId,
      examTitle: exam.title,
      totalScore: exam.totalScore,
      attemptId: attempt.id,
      attemptScore: attempt.score,
      rawScore: attempt.rawScore,
      fudgePoints: attempt.fudgePoints ?? 0,
      penaltyPoints: attempt.penaltyPoints ?? 0,
      submittedAt: attempt.submittedAt,
      mcqScore: Math.round(mcqScore * 100) / 100,
      essayMaxScore: Math.round(essayMax * 100) / 100,
      results,
      studentId: attempt.studentId,
    };
  }

  // ============ SINH MÃ .tex (ex_test) ============

  private generateTex(examTitle: string, items: any[]): string {    const lines: string[] = [];
    lines.push('\\documentclass[12pt]{article}');
    lines.push('\\usepackage{ex_test}');
    lines.push('\\usepackage{amsmath}');
    lines.push('\\usepackage{amssymb}');
    lines.push('\\usepackage{amsfonts}');
    lines.push('\\usepackage{mathtools}');
    lines.push('\\usepackage{siunitx}');
    lines.push('\\usepackage{cancel}');
    lines.push('\\usepackage{empheq}');
    lines.push('\\usepackage{systeme}');
    lines.push('\\usepackage{tikz}');
    lines.push('\\usepackage{pgfplots}');
    lines.push('\\pgfplotsset{compat=1.16}');
    lines.push(
      '\\usetikzlibrary{arrows.meta,calc,patterns,patterns.meta,decorations.pathreplacing,decorations.markings,decorations.pathmorphing,decorations.shapes,decorations.text,decorations.fractals,decorations.footprints,angles,quotes,shapes,shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,positioning,fit,matrix,chains,scopes,through,backgrounds,fadings,shadows,mindmap,trees,plotmarks,intersections,3d,perspective,math,spy,automata,er,petri,datavisualization,datavisualization.formats.functions,lindenmayersystems,calendar,folding,graphs,graphs.standard}',
    );
    lines.push('\\usepackage{tkz-base}');
    lines.push('\\usepackage{tkz-tab}');
    lines.push('\\usepackage{tkz-euclide}');
    lines.push('\\usepackage{circuitikz}');
    lines.push('\\usepackage{tikz-cd}');
    lines.push('\\usepackage{tikz-3dplot}');
    lines.push('\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}');
    lines.push('\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}');
    // Macro VN thường gặp trong đề của giáo viên (chỉ thêm nếu chưa có — tránh xung đột ex_test)
    lines.push('\\makeatletter');
    lines.push('\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}');
    lines.push('\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}');
    lines.push('\\@ifundefined{itemch}{\\newenvironment{itemch}{\\begin{itemize}}{\\end{itemize}}}{}');
    lines.push('\\@ifundefined{itemchoice}{\\newenvironment{itemchoice}{\\begin{itemize}}{\\end{itemize}}}{}');
    lines.push('\\makeatother');
    lines.push('\\begin{document}');
    lines.push(
      '\\begin{center}{\\Large ' + this.escapeLatex(examTitle) + '}\\end{center}',
    );
    lines.push('');

    let currentPart = 0;
    let qIndex = 0;
    for (const item of items) {
      const q = item.question;
      if (item.part !== currentPart) {
        currentPart = item.part;
        lines.push('% ===== PHAN ' + currentPart + ' =====');
      }
      qIndex++;
      lines.push('\\begin{ex}');
      lines.push(this.sanitizeTexContent(q.content));

      if (q.type === QuestionType.MCQ && Array.isArray(q.options)) {
        lines.push('\\choice');
        for (const opt of q.options) {
          const correct = opt.id === q.answer;
          lines.push(correct ? '{\\True ' + this.sanitizeTexContent(opt.text) + '}' : '{' + this.sanitizeTexContent(opt.text) + '}');
        }
      } else if (
        q.type === QuestionType.TRUE_FALSE &&
        Array.isArray(q.options)
      ) {
        lines.push('\\choiceTF');
        for (const opt of q.options) {
          const isTrue =
            q.answer && typeof q.answer === 'object' && q.answer[opt.id] === true;
          lines.push(
            '{' + (isTrue ? '\\TrueTF ' : '\\FalseTF ') + this.sanitizeTexContent(opt.text) + '}',
          );
        }
      } else if (q.type === QuestionType.SHORT_ANSWER) {
        const ans =
          typeof q.answer === 'string' ? q.answer : JSON.stringify(q.answer);
        lines.push('\\shortans{' + ans + '}');
      }

      if (q.solution) {
        lines.push('\\loigiai{' + this.sanitizeTexContent(q.solution) + '}');
      }

      lines.push('\\end{ex}');
      lines.push('');
    }

    lines.push('\\end{document}');
    return lines.join('\n');
  }

  // Sinh .tex cho phiếu học tập (dùng chung cấu trúc ex_test)
  worksheetTex(title: string, items: any[]): string {
    return this.generateTex(title, items);
  }

  // Chuẩn hóa nội dung trước khi biên dịch PDF: eqnarray* không an toàn trong ex_test → align*
  private sanitizeTexContent(s: string): string {
    let tex = String(s || '').replace(
      /\\begin\{eqnarray\*?\}([\s\S]*?)\\end\{eqnarray\*?\}/g,
      (m: string, inner: string) =>
        `\\begin{align*}${inner.replace(/&&/g, '&')}\\end{align*}`,
    );

    // Tự bọc các môi trường toán "trần" (chưa nằm trong $...$ / $$...$$ / \[...\])
    // bằng \[...\] để tránh lỗi "Missing $ inserted" (vd: \begin{cases} nằm ngoài toán)
    const MATH_ENVS =
      'cases|aligned|alignedat|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|gathered|split|align\\*?|alignat\\*?|gather\\*?|multline\\*?';
    tex = tex.replace(
      new RegExp(
        '(\\$\\$|\\$|\\\\\\[|\\\\\\()?\\s*\\\\begin\\{(' + MATH_ENVS + ')\\}([\\s\\S]*?)\\\\end\\{\\2\\}',
        'g',
      ),
      (m: string, delim: string | undefined, env: string, inner: string) => {
        if (delim) return m; // đã có ký tự mở toán → giữ nguyên
        return `\\[\\begin{${env}}${inner}\\end{${env}}\\]`;
      },
    );

    return this.balanceMath(tex);
  }

  // Cân bằng các cấu trúc toán bị thiếu dấu đóng (lỗi "Missing $ inserted")
  // - \heva{...} thiếu '}' → bổ sung '}'
  // - số dấu $ lẻ → bổ sung '$' ở cuối
  private balanceMath(s: string): string {
    let tex = String(s || '');

    const hasUnbalancedHeva = (str: string): boolean => {
      let i = 0;
      const token = '\\heva{';
      while (true) {
        const idx = str.indexOf(token, i);
        if (idx === -1) return false;
        let depth = 0;
        let j = idx + token.length - 1;
        for (; j < str.length; j++) {
          if (str[j] === '\\') {
            j++;
            continue;
          }
          if (str[j] === '{') depth++;
          else if (str[j] === '}') {
            depth--;
            if (depth === 0) break;
          }
        }
        if (j >= str.length) return true;
        i = j + 1;
      }
    };

    if (hasUnbalancedHeva(tex)) tex += '}';

    // Đếm số $ chưa escape (bỏ qua \$)
    const dollars = (tex.match(/(?<!\\)\$/g) || []).length;
    if (dollars % 2 === 1) tex += '$';

    return tex;
  }

  private escapeLatex(s: string): string {
    return (s || '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/_/g, '\\_')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/#/g, '\\#');
  }

  // ============ THI ONLINE (học sinh) ============

  async listAvailableForStudent(studentId: string, grade?: number) {
    const where: any = { status: 'PUBLISHED', archivedAt: null };
    if (grade) where.grade = grade;

    const exams = await this.prisma.exam.findMany({
      where,
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Kèm số lần ĐÃ NỘP + có bài đang làm dở không (đếm bằng groupBy, không tải từng bài)
    const ids = exams.map((e) => e.id);
    const [submitted, inProgress] = ids.length
      ? await Promise.all([
          this.prisma.examAttempt.groupBy({
            by: ['examId'],
            where: { studentId, examId: { in: ids }, submittedAt: { not: null } },
            _count: { _all: true },
          }),
          this.prisma.examAttempt.groupBy({
            by: ['examId'],
            where: { studentId, examId: { in: ids }, submittedAt: null },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const countByExam: Record<string, number> = {};
    for (const g of submitted) countByExam[g.examId] = g._count._all;
    const openByExam = new Set(inProgress.map((g) => g.examId));

    return exams.map((e) => ({
      ...e,
      maxAttempts: e.maxAttempts ?? 3, // cùng mặc định với lúc bắt đầu thi
      myAttempts: countByExam[e.id] || 0,
      inProgress: openByExam.has(e.id),
    }));
  }

  // Phòng luyện đề: danh sách đề theo loại kỳ thi (PRACTICE_TSA / PRACTICE_HSA)
  async listPracticeRoom(studentId: string, examKind: string) {
    const kind = ['PRACTICE_TSA', 'PRACTICE_HSA'].includes(examKind)
      ? examKind
      : 'PRACTICE_TSA';
    const exams = await this.prisma.exam.findMany({
      where: { published: true, examKind: kind, archivedAt: null },
      include: {
        teacher: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const attempts = await this.prisma.examAttempt.findMany({
      where: { studentId, examId: { in: exams.map((e) => e.id) } },
    });
    const bestByExam: Record<string, number> = {};
    for (const a of attempts) {
      const s = a.score ?? 0;
      if (!(a.examId in bestByExam) || s > bestByExam[a.examId]) {
        bestByExam[a.examId] = s;
      }
    }
    return exams.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      duration: e.duration,
      totalScore: e.totalScore,
      sections: e.sections,
      questionCount: e._count?.items ?? 0,
      bestScore: bestByExam[e.id] ?? null,
      attempts: attempts.filter((a) => a.examId === e.id).length,
    }));
  }

  async startAttempt(examId: string, studentId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    if (exam.archivedAt) {
      throw new ForbiddenException('Đề này đã được giáo viên lưu trữ, không làm bài được nữa');
    }

    // Giới hạn số lần thi (0 = vô hạn)
    const maxAttempts = exam.maxAttempts ?? 3;
    const usedAttempts = await this.prisma.examAttempt.count({
      where: { examId, studentId, submittedAt: { not: null } },
    });
    if (maxAttempts > 0 && usedAttempts >= maxAttempts) {
      throw new ForbiddenException(
        `Bạn đã làm bài thi này ${usedAttempts}/${maxAttempts} lần. Không thể làm thêm.`,
      );
    }

    // RESUME: nếu đang làm dở → trả lại bài dở (đáp án đã lưu)
    const existing = await this.prisma.examAttempt.findFirst({
      where: { examId, studentId, submittedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    const attempt = existing
      ? existing
      : await this.prisma.examAttempt.create({
          data: { examId, studentId, answers: {} },
        });

    // Trả câu hỏi KHÔNG kèm đáp án (trừ chế độ luyện tập: kèm luôn để hiện ngay)
    const practice = exam.practiceMode || exam.answersAtEnd === false;
    const questions = exam.items.map((item) => ({
      itemId: item.id,
      order: item.order,
      part: item.part,
      score: item.score,
      type: item.question.type,
      content: item.question.content,
      options: item.question.options,
      // Chỉ câu trắc nghiệm 1 đáp án mới gửi kèm đáp án (để chấm ngay khi luyện tập);
      // các dạng khác chấm sau khi nộp nên không gửi đáp án xuống trình duyệt.
      ...(practice && item.question.type === QuestionType.MCQ
        ? {
            answer: item.question.answer,
            solution: item.question.solution,
          }
        : {}),
    }));

    return {
      attemptId: attempt.id,
      examId: exam.id,
      title: exam.title,
      duration: exam.duration + (exam.extraTime || 0), // cộng thêm giờ hỗ trợ
      baseDuration: exam.duration,
      extraTime: exam.extraTime || 0,
      totalScore: exam.totalScore,
      maxAttempts,
      attemptsUsed: usedAttempts + 1,
      practiceMode: exam.practiceMode,
      answersAtEnd: exam.answersAtEnd,
      passMark: exam.passMark,
      oneTimeResults: exam.oneTimeResults,
      resume: !!existing,
      savedAnswers: (attempt.answers as any) || {},
      savedTimeSpent: attempt.timeSpent || 0,
      questions,
    };
  }

  // Tự lưu tiến trình giữa chừng (đáp án JSON từng câu + thời gian đã dùng)
  async autosaveAttempt(
    examId: string,
    studentId: string,
    attemptId: string,
    answers: any,
    timeSpent?: number,
  ) {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId, studentId, submittedAt: null },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm đang mở');
    return this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        answers: answers || {},
        timeSpent: timeSpent ?? attempt.timeSpent,
      },
    });
  }

  // Chấm NGAY một câu (chế độ luyện tập / answersAtEnd=false)
  async checkAnswer(
    examId: string,
    itemId: string,
    answer: any,
    studentId: string,
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        practiceMode: true,
        answersAtEnd: true,
        teacherId: true,
        items: {
          where: { id: itemId },
          include: { question: true },
        },
      },
    });
    if (!exam || !exam.items.length) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }
    const isTeacher = exam.teacherId === studentId;
    if (!isTeacher && !exam.practiceMode && exam.answersAtEnd !== false) {
      throw new ForbiddenException('Đề này không bật chế độ xem đáp án từng câu');
    }
    const item = exam.items[0];
    const q: any = item.question;
    // Chỉ câu trắc nghiệm 1 đáp án được chấm ngay. Đúng/Sai, nhiều đáp án, trả lời ngắn
    // và tự luận phải NỘP BÀI xong mới chấm — chấm giữa chừng sẽ lộ đáp án các ý còn lại.
    if (q.type !== QuestionType.MCQ) {
      throw new ForbiddenException('Câu này chỉ được chấm sau khi nộp bài');
    }
    let correct: boolean;
    let earned: number;
    if (q.type === QuestionType.TRUE_FALSE) {
      const tf = this.tfFraction(q, answer);
      correct = tf.fraction === 1;
      earned = Math.round(item.score * tf.fraction * 100) / 100;
    } else {
      correct = this.gradeQuestion(q, answer);
      earned = correct ? item.score : 0;
    }
    return {
      itemId,
      correct,
      earned,
      maxScore: item.score,
      answer: q.answer,
      solution: q.solution || null,
    };
  }

  // GV nới điểm tay (fudge points): điểm cuối = raw + fudge − phạt
  async setFudgePoints(
    examId: string,
    teacherId: string,
    attemptId: string,
    fudgePoints: number,
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { teacherId: true },
    });
    if (!exam || !(await this.hasExamAccess(examId, teacherId))) {
      throw new ForbiddenException('Bạn không có quyền truy cập đề thi này');
    }
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt || attempt.examId !== examId) {
      throw new NotFoundException('Không tìm thấy bài làm');
    }
    const fudge = Math.round(Number(fudgePoints || 0) * 100) / 100;
    const finalScore =
      Math.max(
        0,
        Math.round(
          ((attempt.rawScore ?? attempt.score ?? 0) + fudge - (attempt.penaltyPoints || 0)) * 100,
        ) / 100,
      );
    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { fudgePoints: fudge, score: finalScore },
    });
    // Đồng bộ điểm mới vào bài giao (nếu đề này được giao trong khóa học)
    try {
      const subs = await this.prisma.assignmentSubmission.findMany({
        where: { answers: { path: ['attemptId'], equals: attemptId } },
        select: { id: true, score: true, answers: true },
      });
      for (const sub of subs) {
        const fromExam = !!(sub.answers as any)?.__fromExam;
        await this.prisma.assignmentSubmission.update({
          where: { id: sub.id },
          data: {
            aiScore: finalScore,
            ...(sub.score == null || fromExam ? { score: finalScore } : {}),
            aiComment: null,
          },
        });
      }
    } catch {
      /* bỏ qua */
    }
    return updated;
  }

  // Chấm lại TOÀN BỘ bài đã nộp của đề (sau khi GV sửa đáp án đề/câu hỏi)
  // Chấm lại một tập bài (mặc định: mọi bài đã nộp của đề). Trả về map điểm mới.
  async regradeAttempts(examId: string, teacherId: string, attemptIds?: string[]) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { teacherId: true, totalScore: true },
    });
    if (!exam || !(await this.hasExamAccess(examId, teacherId))) {
      throw new ForbiddenException('Bạn không có quyền truy cập đề thi này');
    }
    const items = await this.prisma.examItem.findMany({
      where: { examId },
      include: { question: true },
    });
    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        examId,
        submittedAt: { not: null },
        ...(attemptIds ? { id: { in: attemptIds } } : {}),
      },
    });
    let changed = 0;
    const details: any[] = [];
    const scores: Record<string, number> = {};
    for (const attempt of attempts) {
      const answers = (attempt.answers as any) || {};
      let raw = 0;
      for (const item of items) {
        const q: any = item.question;
        const stuAns = answers[item.id];
        if (q.type === QuestionType.ESSAY) continue;
        if (q.type === QuestionType.TRUE_FALSE) {
          raw += Math.round(item.score * this.tfFraction(q, stuAns).fraction * 100) / 100;
        } else if (this.gradeQuestion(q, stuAns)) {
          raw += item.score;
        }
      }
      raw = Math.round(raw * 100) / 100;
      const newScore = Math.max(
        0,
        Math.round((raw + (attempt.fudgePoints || 0) - (attempt.penaltyPoints || 0)) * 100) / 100,
      );
      scores[attempt.id] = newScore;
      if (newScore !== attempt.score) {
        changed++;
        await this.prisma.examAttempt.update({
          where: { id: attempt.id },
          data: { rawScore: raw, score: newScore, regradedAt: new Date() },
        });
        await this.prisma.notification.create({
          data: {
            userId: attempt.studentId,
            title: '🔄 Đề thi được chấm lại',
            body: `Điểm bài thi đã cập nhật: ${attempt.score ?? '—'} → ${newScore}/${exam.totalScore}`,
            link: `/student/exams/${examId}`,
          },
        });
        details.push({
          attemptId: attempt.id,
          studentId: attempt.studentId,
          oldScore: attempt.score,
          newScore,
        });
      } else if (attempt.rawScore !== raw) {
        await this.prisma.examAttempt.update({
          where: { id: attempt.id },
          data: { rawScore: raw, regradedAt: new Date() },
        });
      }
    }
    return { total: attempts.length, changed, details, scores };
  }

  async regradeExam(examId: string, teacherId: string) {
    return this.regradeAttempts(examId, teacherId);
  }

  // Chấm lại toàn bộ bài (sau khi GV sửa đề/đáp án) + thông báo nếu điểm đổi
  async regradeAttempt(examId: string, teacherId: string, attemptId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { teacherId: true, totalScore: true },
    });
    if (!exam || !(await this.hasExamAccess(examId, teacherId))) {
      throw new ForbiddenException('Bạn không có quyền truy cập đề thi này');
    }
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt || attempt.examId !== examId) {
      throw new NotFoundException('Không tìm thấy bài làm');
    }
    const items = await this.prisma.examItem.findMany({
      where: { examId },
      include: { question: true },
    });
    const answers = (attempt.answers as any) || {};
    let raw = 0;
    for (const item of items) {
      const q: any = item.question;
      const stuAns = answers[item.id];
      if (q.type === QuestionType.ESSAY) continue; // tự luận giữ nguyên
      if (q.type === QuestionType.TRUE_FALSE) {
        raw += Math.round(item.score * this.tfFraction(q, stuAns).fraction * 100) / 100;
      } else if (this.gradeQuestion(q, stuAns)) {
        raw += item.score;
      }
    }
    raw = Math.round(raw * 100) / 100;
    const oldScore = attempt.score;
    const newScore = Math.max(
      0,
      Math.round((raw + (attempt.fudgePoints || 0) - (attempt.penaltyPoints || 0)) * 100) / 100,
    );
    const updated = await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: { rawScore: raw, score: newScore, regradedAt: new Date() },
    });
    if (oldScore !== newScore && attempt.submittedAt) {
      await this.prisma.notification.create({
        data: {
          userId: attempt.studentId,
          title: '🔄 Đề thi được chấm lại',
          body: `Điểm bài thi đã cập nhật: ${oldScore ?? '—'} → ${newScore}/${exam.totalScore}`,
          link: `/student/exams/${examId}`,
        },
      });
    }
    // Đồng bộ điểm mới vào bài giao (nếu đề này được giao trong khóa học)
    try {
      const subs = await this.prisma.assignmentSubmission.findMany({
        where: { answers: { path: ['attemptId'], equals: attemptId } },
        select: { id: true, score: true, answers: true },
      });
      for (const sub of subs) {
        const fromExam = !!(sub.answers as any)?.__fromExam;
        await this.prisma.assignmentSubmission.update({
          where: { id: sub.id },
          data: {
            aiScore: newScore,
            // Bài thi: điểm cuối lấy theo hệ thống; bài thường: chỉ điền nếu chưa có điểm tay
            ...(sub.score == null || fromExam ? { score: newScore } : {}),
            aiComment: null,
          },
        });
      }
    } catch {
      /* bỏ qua nếu không có bài giao liên kết */
    }
    return { ...updated, oldScore, changed: oldScore !== newScore };
  }

  // Cổng hiển thị đáp án (Canvas show_correct_answers): GV luôn xem;
  // HS: khóa sau hideAnswersAt; oneTimeResults chỉ xem 1 lần
  // Bài giao có "điểm tối thiểu để xem đáp án": chưa đủ điểm → khóa đáp án
  private async lockedByMinScore(examId: string, studentId: string, score: number) {
    const minAsg = await this.prisma.assignment.findFirst({
      where: {
        examId,
        minScoreForAnswers: { not: null },
        course: { enrollments: { some: { studentId } } },
      },
      orderBy: { minScoreForAnswers: 'desc' },
      select: { minScoreForAnswers: true },
    });
    return !!(minAsg && minAsg.minScoreForAnswers != null && score < minAsg.minScoreForAnswers);
  }

  // Đáp án bị khóa thì KHÔNG gửi đáp án/lời giải xuống trình duyệt (vẫn cho biết câu đúng/sai)
  private stripAnswers(results: any[]) {
    for (const r of results) {
      r.correctAnswer = null;
      r.solution = null;
    }
  }

  canViewAnswers(exam: any, attempt: any, isTeacher: boolean): boolean {
    if (isTeacher) return true;
    if (!exam) return false;
    if (exam.hideAnswersAt && new Date(exam.hideAnswersAt).getTime() < Date.now()) {
      return false;
    }
    if (exam.oneTimeResults && attempt?.resultsViewedAt) {
      return false;
    }
    return true;
  }

  async submitAttempt(
    examId: string,
    studentId: string,
    attemptId: string,
    answers: any,
    timeSpent?: number,
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: { question: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');

    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId, studentId },
    });
    if (!attempt) throw new NotFoundException('Không tìm thấy bài làm');

    let score = 0;
    let essayCount = 0;
    const results: any[] = [];

    for (const item of exam.items) {
      const q = item.question as any;
      const stuAns = answers ? answers[item.id] : null;

      if (q.type === QuestionType.ESSAY) {
        // Tự luận: chấm AI bất đồng bộ sau khi nộp
        essayCount++;
        results.push({
          maxScore: item.score,
          itemId: item.id,
          order: item.order,
          type: q.type,
          content: q.content,
          options: q.options,
          correctAnswer: q.answer,
          studentAnswer: stuAns ?? null,
          correct: null,
          earned: null,
          pending: true,
          solution: q.solution,
        });
        continue;
      }

      // Đúng/sai: chấm bậc thang theo quy tắc VN (4/4=100%, 3/4=50%, 2/4=25%, 1/4=10%)
      let tf: { fraction: number; correctCount: number; total: number } | null =
        null;
      if (q.type === QuestionType.TRUE_FALSE) {
        tf = this.tfFraction(q, stuAns);
      }
      const correct =
        q.type === QuestionType.TRUE_FALSE
          ? tf!.fraction === 1
          : this.gradeQuestion(q, stuAns);
      const earned =
        q.type === QuestionType.TRUE_FALSE
          ? Math.round(item.score * tf!.fraction * 100) / 100
          : correct
            ? item.score
            : 0;
      score += earned;
      results.push({
        maxScore: item.score,
        itemId: item.id,
        order: item.order,
        type: q.type,
        content: q.content,
        options: q.options,
        correctAnswer: q.answer,
        studentAnswer: stuAns ?? null,
        correct,
        earned,
        tfDetail: tf,
        solution: q.solution,
      });
    }

    score = Math.round(score * 100) / 100;

    // Kiểm tra nộp muộn: đề là BTVN của bài giảng có deadline mà học sinh đã đăng ký khóa học
    const lessonWithDeadline = await this.prisma.lesson.findFirst({
      where: {
        examId,
        deadline: { not: null },
        course: { enrollments: { some: { studentId } } },
      },
    });
    const late = !!(
      lessonWithDeadline &&
      lessonWithDeadline.deadline &&
      new Date() > new Date(lessonWithDeadline.deadline)
    );

    const rawScore = Math.round(score * 100) / 100;
    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        answers: (answers ?? {}) as any,
        rawScore,
        score: rawScore, // fudge/phạt = 0 lúc nộp
        late,
        submittedAt: new Date(),
        timeSpent: timeSpent ?? null,
      },
    });

    // Cộng XP, level, thành tích
    const gamification = await this.gamification.processExamResult(
      studentId,
      score,
      exam.totalScore,
    );

    // Chạy nền: chấm AI tự luận + phân tích điểm mạnh/yếu
    if (essayCount > 0 || exam.items.length > 0) {
      this.processPostSubmit(examId, studentId, attemptId).catch((e) =>
        console.warn('postSubmit loi:', e?.message),
      );
    }

    // Điểm chuẩn đậu (pass_mark) — ưu tiên passMark, mặc định 50% tổng điểm
    const passThreshold =
      exam.passMark != null
        ? exam.passMark
        : Math.round(exam.totalScore * 0.5 * 100) / 100;

    // ===== Bài tập giao có yêu cầu ĐIỂM TỐI THIỂU để xem đáp án =====
    // Nếu đề nằm trong bài giao có minScoreForAnswers và học sinh chưa đủ điểm → khóa đáp án
    let answersVisible = this.canViewAnswers(exam, { resultsViewedAt: null }, false);
    if (answersVisible && (await this.lockedByMinScore(examId, studentId, score))) {
      answersVisible = false;
    }
    if (!answersVisible) this.stripAnswers(results);

    return {
      attemptId,
      score,
      totalScore: exam.totalScore,
      passed: score >= passThreshold,
      passMark: passThreshold,
      late,
      results,
      answersVisible,
      xp: gamification,
      pending: essayCount > 0 ? { essays: essayCount, analysis: true } : { essays: 0, analysis: true },
    };
  }

  // ============ ITEM ANALYSIS (Canvas quiz statistics) ============

  async statistics(examId: string, teacherId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: { include: { question: true }, orderBy: { order: 'asc' } },
      },
    });
    if (!exam || exam.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu đề thi này');
    }
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, submittedAt: { not: null } },
      orderBy: { score: 'desc' },
    });
    const n = attempts.length;
    if (!n) {
      return { examId, title: exam.title, totalScore: exam.totalScore, n: 0, items: [], cronbachAlpha: null };
    }

    const totals = attempts.map((a) => a.score ?? 0);
    const mean = totals.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(totals.reduce((s, x) => s + (x - mean) ** 2, 0) / n);

    // Nhóm top 27% / bottom 27% (Canvas)
    const topCount = Math.max(1, Math.round(n * 0.27));
    const sorted = [...attempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top = sorted.slice(0, topCount);
    const bottom = sorted.slice(n - topCount);

    const items = exam.items
      .filter(
        (i) =>
          (i.question as any).type === QuestionType.MCQ ||
          (i.question as any).type === QuestionType.TRUE_FALSE,
      )
      .map((item) => {
        const q: any = item.question;
        const correct = attempts.filter(
          (a) => this.gradeQuestion(q, (a.answers as any)?.[item.id]),
        ).length;
        const optionCounts: Record<string, number> = {};
        for (const opt of q.options || []) optionCounts[opt.id] = 0;
        const biserials: Record<string, number> = {};
        for (const a of attempts) {
          const chosen = (a.answers as any)?.[item.id];
          if (chosen != null && optionCounts[chosen] !== undefined) {
            optionCounts[chosen]++;
          }
        }
        for (const opt of q.options || []) {
          const chosenIds = attempts.filter(
            (a) => (a.answers as any)?.[item.id] === opt.id,
          );
          const notChosen = attempts.filter(
            (a) => (a.answers as any)?.[item.id] !== opt.id,
          );
          const mC =
            chosenIds.length && sd > 0
              ? chosenIds.reduce((s, a) => s + (a.score ?? 0), 0) / chosenIds.length
              : 0;
          const mN =
            notChosen.length && sd > 0
              ? notChosen.reduce((s, a) => s + (a.score ?? 0), 0) / notChosen.length
              : 0;
          const p = chosenIds.length / n;
          biserials[opt.id] =
            sd > 0 ? Math.round(((mC - mN) / sd) * Math.sqrt(p * (1 - p)) * 100) / 100 : 0;
        }
        // Độ phân biệt nhóm trên/dưới
        const topCorrect = top.filter(
          (a) => this.gradeQuestion(q, (a.answers as any)?.[item.id]),
        ).length;
        const bottomCorrect = bottom.filter(
          (a) => this.gradeQuestion(q, (a.answers as any)?.[item.id]),
        ).length;
        return {
          itemId: item.id,
          order: item.order,
          type: q.type,
          content: q.content,
          answer: q.answer,
          maxScore: item.score,
          correctCount: correct,
          n,
          difficultyIndex: Math.round((correct / n) * 100) / 100, // % đúng
          discrimination:
            Math.round((topCorrect / top.length - bottomCorrect / bottom.length) * 100) / 100,
          optionCounts,
          optionRatios: Object.fromEntries(
            Object.entries(optionCounts).map(([k, v]) => [k, Math.round((v / n) * 100) / 100]),
          ),
          pointBiserials: biserials,
        };
      });

    // Cronbach's alpha trên câu trắc nghiệm (đúng = 1, sai = 0)
    let alpha: number | null = null;
    const k = items.length;
    if (k > 1) {
      const variances = items.map((it) => {
        const p = it.correctCount / n;
        return p * (1 - p);
      });
      const totalProps = attempts.map((a) => {
        let c = 0;
        for (const it of items) {
          const q = exam.items.find((x) => x.id === it.itemId)?.question as any;
          if (q && this.gradeQuestion(q, (a.answers as any)?.[it.itemId])) c++;
        }
        return c / k;
      });
      const meanP = totalProps.reduce((s, x) => s + x, 0) / n;
      const varTotal = totalProps.reduce((s, x) => s + (x - meanP) ** 2, 0) / n;
      const sumVar = variances.reduce((s, x) => s + x, 0);
      alpha =
        varTotal > 0
          ? Math.round(((k / (k - 1)) * (1 - sumVar / varTotal)) * 100) / 100
          : null;
    }

    return {
      examId,
      title: exam.title,
      totalScore: exam.totalScore,
      n,
      mean: Math.round(mean * 100) / 100,
      sd: Math.round(sd * 100) / 100,
      topGroup: topCount,
      bottomGroup: topCount,
      cronbachAlpha: alpha,
      items,
    };
  }

  // GV cập nhật thiết lập thi (pass_mark, practice, cổng đáp án, extra time...)
  async updateSettings(examId: string, teacherId: string, body: any) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { teacherId: true },
    });
    if (!exam || exam.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu đề thi này');
    }
    const data: any = {};
    if (body.passMark !== undefined)
      data.passMark = body.passMark === '' || body.passMark == null ? null : Number(body.passMark);
    if (body.practiceMode !== undefined) data.practiceMode = !!body.practiceMode;
    if (body.answersAtEnd !== undefined) data.answersAtEnd = !!body.answersAtEnd;
    if (body.oneTimeResults !== undefined) data.oneTimeResults = !!body.oneTimeResults;
    if (body.hideAnswersAt !== undefined)
      data.hideAnswersAt = body.hideAnswersAt ? new Date(body.hideAnswersAt) : null;
    if (body.extraTime !== undefined) data.extraTime = Number(body.extraTime) || 0;
    if (body.maxAttempts !== undefined) data.maxAttempts = Number(body.maxAttempts) || 0;
    return this.prisma.exam.update({ where: { id: examId }, data });
  }

  // Chấm AI các câu tự luận + phân tích điểm mạnh/yếu (chạy nền sau khi nộp)
  private async processPostSubmit(
    examId: string,
    studentId: string,
    attemptId: string,
  ) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          include: { question: { include: { topic: true } } },
          orderBy: { order: 'asc' },
        },
      },
    });
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!exam || !attempt) return;

    const answers = (attempt.answers as any) || {};
    let essayScore = 0;
    const analysisItems: { topic: string; difficulty: string; correct: boolean }[] = [];

    for (const item of exam.items) {
      const q = item.question as any;
      const stuAns = answers[item.id];

      if (q.type === QuestionType.ESSAY) {
        // Bài làm có thể là chuỗi {text} hoặc object {text, images}
        const isObj = stuAns && typeof stuAns === 'object';
        const text = isObj ? stuAns.text || '' : typeof stuAns === 'string' ? stuAns : '';
        const images = isObj && Array.isArray(stuAns.images) ? stuAns.images : [];
        const hasAnswer = text.trim().length > 0 || images.length > 0;

        if (hasAnswer) {
          try {
            const ai = await this.ai.gradeEssayFull(
              q.content,
              q.solution || '',
              text,
              images,
            );
            const aiScore =
              typeof ai?.score === 'number'
                ? Math.round(Math.max(0, Math.min(item.score, (ai.score / 10) * item.score)) * 100) / 100
                : null;
            const feedback = [
              ai?.suggestion,
              ...(ai?.strengths || []).map((s: string) => `• Điểm mạnh: ${s}`),
              ...(ai?.weaknesses || []).map((w: string) => `• Cần cải thiện: ${w}`),
            ]
              .filter(Boolean)
              .join('\n');
            answers[item.id] = {
              text,
              images,
              aiScore,
              aiFeedback: feedback || null,
              finalScore: null,
              finalComment: null,
            };
            if (aiScore !== null) essayScore += aiScore;
          } catch (e) {
            answers[item.id] = {
              text,
              images,
              aiScore: null,
              aiFeedback: null,
              finalScore: null,
              finalComment: null,
            };
          }
        }
        analysisItems.push({
          topic: q.topic?.name || 'Tự luận',
          difficulty: q.difficulty || '',
          correct: hasAnswer,
        });
      } else {
        const correct = this.gradeQuestion(q, stuAns);
        analysisItems.push({
          topic: q.topic?.name || 'Chưa phân loại',
          difficulty: q.difficulty || '',
          correct,
        });
      }
    }

    // Phân tích điểm mạnh/yếu
    let analysis: any = null;
    try {
      analysis = await this.ai.analyzeStrengths(analysisItems);
    } catch (e) {
      analysis = { strengths: [], weaknesses: [], advice: '' };
    }

    const baseScore = attempt.score ?? 0;
    const newScore = Math.round((baseScore + essayScore) * 100) / 100;

    await this.prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        answers: answers as any,
        score: newScore,
        perPart: { aiAnalysis: analysis } as any,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: studentId,
        title: '✅ Bài thi đã chấm xong',
        body: 'Điểm tự luận (AI) và phân tích điểm mạnh/yếu đã sẵn sàng. Xem trong Lịch sử làm bài.',
        link: '/student/attempts',
      },
    });

    // Gửi email thông báo (nếu học sinh bật nhận email + SMTP đã cấu hình)
    try {
      const student = await this.prisma.user.findUnique({
        where: { id: studentId },
        select: { email: true, fullName: true, emailNotify: true },
      });
      if (student?.emailNotify) {
        const webUrl = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
        this.mail
          .sendNotification(
            student.email,
            'Bài thi của bạn đã được chấm xong',
            `Điểm của bạn: ${newScore}/${exam.totalScore}. Điểm tự luận (AI) và phân tích điểm mạnh/yếu đã sẵn sàng.`,
            `${webUrl}/student/attempts`,
          )
          .catch(() => {});
      }
    } catch (e) {
      /* bỏ qua */
    }
  }

  // Chấm câu Đúng/Sai theo bậc thang chương trình Việt Nam:
  // Đúng 4/4 = 100%, 3/4 = 50%, 2/4 = 25%, 1/4 = 10%, 0 = 0%
  private tfFraction(
    q: any,
    stuAns: any,
  ): { fraction: number; correctCount: number; total: number } {
    const ans = q?.answer as any;
    const opts = (q?.options as any[]) || [];
    const keys = opts?.length
      ? opts.map((o: any) => o.id)
      : ans && typeof ans === 'object'
        ? Object.keys(ans)
        : ['A', 'B', 'C', 'D'];
    const total = keys.length || 4;

    let correctCount = 0;
    if (ans && typeof ans === 'object' && stuAns && typeof stuAns === 'object') {
      // Bài làm cũ (chỉ tick ý ĐÚNG): không tick = Sai. Bài trống hoàn toàn = 0 điểm.
      const answered = Object.keys(stuAns).length > 0;
      if (answered) {
        for (const k of keys) {
          const trueAns = ans[k] === true; // mệnh đề này ĐÚNG hay SAI
          const stuTrue = stuAns[k] === true; // HS chọn ĐÚNG (bỏ trống = Sai)
          if (stuTrue === trueAns) correctCount++;
        }
      }
    }

    const ratio = total > 0 ? correctCount / total : 0;
    let fraction = 0;
    if (ratio === 1) fraction = 1;
    else if (ratio >= 0.75) fraction = 0.5;
    else if (ratio >= 0.5) fraction = 0.25;
    else if (ratio > 0) fraction = 0.1;

    return { fraction, correctCount, total };
  }

  // Công khai cho module khác kiểm tra đúng/sai 1 đáp án (phân tích điểm mạnh/yếu)
  isAnswerCorrect(q: any, stuAns: any): boolean {
    return this.gradeQuestion(q, stuAns);
  }

  private gradeQuestion(q: any, stuAns: any): boolean {
    if (q.type === QuestionType.MCQ) {
      return stuAns === q.answer;
    }
    if (q.type === QuestionType.MULTI_ANSWER) {
      const correct = Array.isArray(q.answer)
        ? q.answer.map((x: any) => String(x))
        : String(q.answer ?? '')
            .split('')
            .filter((c) => c.trim());
      const chosen = Array.isArray(stuAns)
        ? stuAns.map((x: any) => String(x))
        : stuAns
          ? [String(stuAns)]
          : [];
      if (!correct.length || chosen.length !== correct.length) return false;
      return correct.every((c) => chosen.includes(c));
    }
    if (q.type === QuestionType.TRUE_FALSE) {
      const ans = q.answer as any;
      if (!ans || typeof ans !== 'object' || !stuAns || typeof stuAns !== 'object') {
        return false;
      }
      for (const k of Object.keys(ans)) {
        if (stuAns[k] !== ans[k]) return false;
      }
      return true;
    }
    if (q.type === QuestionType.SHORT_ANSWER) {
      const a = String(q.answer).trim().toLowerCase().replace(/\s+/g, '');
      const b = String(stuAns ?? '').trim().toLowerCase().replace(/\s+/g, '');
      return a.length > 0 && a === b;
    }
    return false;
  }
}
