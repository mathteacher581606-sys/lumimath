import {
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto } from './dto/create-exam.dto';

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(teacherId: string, dto: CreateExamDto) {
    const bank = await this.getBank(teacherId);
    const parts: any[] = dto.matrix?.parts || [];

    const usedIds: string[] = [];
    const examItems: any[] = [];
    let order = 1;
    let totalScore = 0;

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const type = part.type as QuestionType;
      const count = part.count || 0;
      const score = part.score || 0;
      totalScore += count * score;

      const pool = await this.prisma.question.findMany({
        where: { bankId: bank.id, type, id: { notIn: usedIds } },
      });

      const picked = this.shuffle(pool).slice(0, count);
      for (const q of picked) {
        examItems.push({
          questionId: q.id,
          part: p + 1,
          order: order++,
          score,
        });
        usedIds.push(q.id);
      }
    }

    const exam = await this.prisma.exam.create({
      data: {
        teacherId,
        title: dto.title,
        description: dto.description,
        grade: dto.grade,
        duration: dto.duration ?? 45,
        totalScore,
        matrix: dto.matrix ?? null,
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

  async findAll(teacherId: string) {
    return this.prisma.exam.findMany({
      where: { teacherId },
      include: { _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(teacherId: string, id: string) {
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
    return exam;
  }

  async remove(teacherId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    return this.prisma.exam.delete({ where: { id } });
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

  async compile(teacherId: string, id: string) {
    const tex = await this.getTex(teacherId, id);
    const url = process.env.LATEX_SERVICE_URL || 'http://localhost:8080';

    let res: Response;
    try {
      res = await fetch(`${url}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: tex }),
      });
    } catch (e) {
      throw new HttpException(
        'Không kết nối được LaTeX service: ' + (e as Error).message,
        503,
      );
    }

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new HttpException(err.error || 'Compile thất bại', 500);
    }

    const pdf = Buffer.from(await res.arrayBuffer());
    const pdfUrl = `/api/exams/${id}/pdf`;
    await this.prisma.exam.update({
      where: { id },
      data: { pdfUrl },
    });
    return pdf;
  }

  // ============ SINH MÃ .tex (ex_test) ============

  private generateTex(examTitle: string, items: any[]): string {
    const lines: string[] = [];
    lines.push('\\documentclass[12pt]{article}');
    lines.push('\\usepackage{ex_test}');
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
      lines.push(q.content);

      if (q.type === QuestionType.MCQ && Array.isArray(q.options)) {
        lines.push('\\choice');
        for (const opt of q.options) {
          const correct = opt.id === q.answer;
          lines.push(correct ? '{\\True ' + opt.text + '}' : '{' + opt.text + '}');
        }
      }

      if (q.solution) {
        lines.push('\\loigiai{' + q.solution + '}');
      }

      lines.push('\\end{ex}');
      lines.push('');
    }

    lines.push('\\end{document}');
    return lines.join('\n');
  }

  private escapeLatex(s: string): string {
    return (s || '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/_/g, '\\_')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/#/g, '\\#');
  }
}
