import { Injectable, NotFoundException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class BankService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.q) where.content = { contains: query.q };

    return this.prisma.question.findMany({
      where,
      include: { topic: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 100,
      skip: query.skip ? Number(query.skip) : 0,
    });
  }

  async createQuestion(teacherId: string, dto: CreateQuestionDto) {
    const bank = await this.getBank(teacherId);
    const code = await this.generateUniqueCode(dto.type);

    return this.prisma.question.create({
      data: {
        code,
        bankId: bank.id,
        type: dto.type,
        content: dto.content,
        options: dto.options ?? null,
        answer: dto.answer,
        solution: dto.solution,
        grade: dto.grade,
        topicId: dto.topicId,
        difficulty: dto.difficulty,
        texSource: dto.texSource,
      },
    });
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
    return this.prisma.question.update({
      where: { id },
      data: { ...dto },
    });
  }

  async removeQuestion(teacherId: string, id: string) {
    const bank = await this.getBank(teacherId);
    const question = await this.prisma.question.findFirst({
      where: { id, bankId: bank.id },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    return this.prisma.question.delete({ where: { id } });
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
    const solution = this.extractArg(block, '\\loigiai');

    if (block.includes('\\choiceTF')) {
      return this.parseTrueFalse(block, solution);
    }
    if (block.includes('\\shortans')) {
      return this.parseShortAnswer(block, solution);
    }
    if (block.includes('\\choice')) {
      return this.parseMcq(block, solution);
    }

    const content = block.replace(/\\loigiai\{[\s\S]*?\}/, '').trim();
    return {
      type: QuestionType.ESSAY,
      content,
      options: null,
      answer: { rubric: solution || '' },
      solution,
    };
  }

  private parseMcq(block: string, solution?: string): any {
    const parts = block.split('\\choice');
    const content = parts[0].replace(/\\loigiai\{[\s\S]*?\}/, '').trim();
    const rest = parts[1] || '';
    const optMatches = rest.match(/\{([\s\S]*?)\}/g) || [];
    const options: any[] = [];
    let answer: string | null = null;
    optMatches.forEach((opt, i) => {
      const inner = opt.slice(1, -1).trim();
      const isTrue = inner.startsWith('\\True');
      const text = isTrue ? inner.replace(/^\\True\s*/, '') : inner;
      const id = String.fromCharCode(65 + i);
      options.push({ id, text });
      if (isTrue) answer = id;
    });
    return {
      type: QuestionType.MCQ,
      content,
      options,
      answer: answer || 'A',
      solution,
    };
  }

  private parseTrueFalse(block: string, solution?: string): any {
    const parts = block.split('\\choiceTF');
    const content = parts[0].replace(/\\loigiai\{[\s\S]*?\}/, '').trim();
    const rest = parts[1] || '';
    const stmtMatches = rest.match(/\{([\s\S]*?)\}/g) || [];
    const ids = ['a', 'b', 'c', 'd'];
    const options: any[] = [];
    const answer: any = {};
    stmtMatches.forEach((stmt, i) => {
      const inner = stmt.slice(1, -1).trim();
      const isTrue = inner.startsWith('\\TrueTF') || !inner.startsWith('\\FalseTF');
      const text = inner.replace(/^\\(TrueTF|FalseTF)\s*/, '');
      const id = ids[i] || String(i + 1);
      options.push({ id, text });
      answer[id] = isTrue;
    });
    return {
      type: QuestionType.TRUE_FALSE,
      content,
      options,
      answer,
      solution,
    };
  }

  private parseShortAnswer(block: string, solution?: string): any {
    const parts = block.split('\\shortans');
    const content = parts[0].replace(/\\loigiai\{[\s\S]*?\}/, '').trim();
    const saMatch = (parts[1] || '').match(/\{([\s\S]*?)\}/);
    const answer = saMatch ? saMatch[1].trim() : '';
    return {
      type: QuestionType.SHORT_ANSWER,
      content,
      options: null,
      answer,
      solution,
    };
  }

  private extractArg(block: string, cmd: string): string | null {
    const regex = new RegExp(cmd + '\\{([\\s\\S]*?)\\}');
    const m = block.match(regex);
    return m ? m[1].trim() : null;
  }
}
