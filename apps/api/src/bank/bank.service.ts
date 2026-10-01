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
}
