import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { BankService } from './bank.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ImportTexDto } from './dto/import-tex.dto';

@Controller('bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  // ============ CHỦ ĐỀ ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('topics')
  listTopics(@CurrentUser() user: any) {
    return this.bankService.listTopics(user.id);
  }

  // Cây mục lục 3 cấp (CHƯƠNG → Bài → Dạng) kèm số câu
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('topics/tree')
  getTopicTree(@CurrentUser() user: any, @Query('grade') grade?: string) {
    return this.bankService.getTopicTree(
      user.id,
      grade ? Number(grade) : undefined,
    );
  }

  // Seed cây mục lục (lớp 10 + 11) — idempotent, chạy lại không nhân bản
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('topics/seed')
  seedTaxonomy(
    @CurrentUser() user: any,
    @Query('reset') reset?: string,
    @Query('grade') grade?: string,
  ) {
    return this.bankService.seedTaxonomy(
      user.id,
      reset === '1' || reset === 'true',
      grade ? Number(grade) : undefined,
    );
  }

  // Giữ tương thích: seed riêng lớp 10
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('topics/seed-grade10')
  seedGrade10(@CurrentUser() user: any, @Query('reset') reset?: string) {
    return this.bankService.seedTaxonomy(user.id, reset === '1' || reset === 'true', 10);
  }

  // AI phân loại lại toàn bộ câu hỏi theo cây mục lục (dạng lá)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('reclassify')
  reclassify(
    @CurrentUser() user: any,
    @Query('grade') grade?: string,
    @Query('limit') limit?: string,
    @Query('onlyUnclassified') onlyUnclassified?: string,
    @Query('updatedAfter') updatedAfter?: string,
  ) {
    return this.bankService.reclassifyQuestions(user.id, {
      grade: grade ? Number(grade) : undefined,
      limit: limit ? Number(limit) : undefined,
      onlyUnclassified: onlyUnclassified === '1' || onlyUnclassified === 'true',
      updatedAfter,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('topics')
  createTopic(@CurrentUser() user: any, @Body() dto: CreateTopicDto) {
    return this.bankService.createTopic(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch('topics/:id')
  updateTopic(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.bankService.updateTopic(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('topics/:id')
  removeTopic(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.removeTopic(user.id, id);
  }

  // ============ CÂU HỎI ============

  // Thống kê chất lượng câu hỏi (phải khai báo trước 'questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('questions/stats')
  questionStats(@CurrentUser() user: any) {
    return this.bankService.questionStats(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('questions')
  listQuestions(@CurrentUser() user: any, @Query() query: any) {
    return this.bankService.listQuestions(user.id, query);
  }

  // Danh sách câu hỏi có PHÂN TRANG + SẮP XẾP (khai báo trước 'questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('questions-paged')
  listQuestionsPaged(@CurrentUser() user: any, @Query() query: any) {
    return this.bankService.listQuestionsPaged(user.id, query);
  }

  // Xuất các câu hỏi đã chọn ra .docx (đề hoặc kèm đáp án)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('questions/export-docx')
  async exportQuestionsDocx(
    @CurrentUser() user: any,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.bankService.exportQuestionsDocx(
      user.id,
      body?.ids || [],
      !!body?.withAnswers,
      body?.mathMode === 'tex' ? 'tex' : 'omml',
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  // Xuất phiếu học tập theo dạng bài (docx / tex / pdf, có thể bản A/B + kèm đáp án)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('worksheets/docx')
  async exportWorksheetDocx(
    @CurrentUser() user: any,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const r = await this.bankService.exportWorksheet(user.id, body);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`,
    );
    res.send(r.buffer);
  }

  // Danh sách dạng toán (phân loại theo dạng) + số câu mỗi dạng
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('forms')
  listForms(@CurrentUser() user: any) {
    return this.bankService.listForms(user.id);
  }

  // Đăng ký dạng toán mới
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('forms')
  addForm(@CurrentUser() user: any, @Body('name') name: string) {
    return this.bankService.addForm(user.id, name);
  }

  // Dạng bài + số câu theo lớp/chủ đề (trình tạo đề nhanh)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('forms-by-filter')
  listFormsByFilter(@CurrentUser() user: any, @Query() query: any) {
    return this.bankService.listFormsByFilter(user.id, query);
  }

  // Gợi ý gộp các dạng bài gần giống (khai báo trước 'forms/:name')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('forms/suggest-merges')
  suggestFormMerges(@CurrentUser() user: any) {
    return this.bankService.suggestFormMerges(user.id);
  }

  // Gộp 2 dạng bài
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('forms/merge')
  mergeForms(@CurrentUser() user: any, @Body() body: any) {
    return this.bankService.mergeForms(user.id, body?.keep, body?.drop);
  }

  // Đổi tên dạng bài (tự cập nhật mọi câu hỏi)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch('forms/:name')
  renameForm(
    @CurrentUser() user: any,
    @Param('name') name: string,
    @Body('newName') newName: string,
  ) {
    return this.bankService.renameForm(user.id, decodeURIComponent(name), newName);
  }

  // Xóa dạng bài (câu hỏi chuyển về không dạng bài)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('forms/:name')
  deleteForm(@CurrentUser() user: any, @Param('name') name: string) {
    return this.bankService.deleteForm(user.id, decodeURIComponent(name));
  }

  // Danh sách nguồn đề + số câu mỗi nguồn
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('sources')
  listSources(@CurrentUser() user: any) {
    return this.bankService.listSources(user.id);
  }

  // Đăng ký nguồn đề mới
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('sources')
  addSource(@CurrentUser() user: any, @Body('name') name: string) {
    return this.bankService.addSource(user.id, name);
  }

  // Xóa nguồn đề
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('sources/:name')
  removeSource(@CurrentUser() user: any, @Param('name') name: string) {
    return this.bankService.removeSource(user.id, decodeURIComponent(name));
  }

  // Tổng quan ngân hàng (banner thống kê)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('summary')
  bankSummary(@CurrentUser() user: any) {
    return this.bankService.bankSummary(user.id);
  }

  // Dò các cặp câu hỏi trùng nhau trong kho
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('duplicates')
  findDuplicatePairs(@CurrentUser() user: any, @Query() q: any) {
    return this.bankService.findDuplicatePairs(user.id, {
      topicId: q?.topicId ? String(q.topicId) : undefined,
      grade: q?.grade ? Number(q.grade) : undefined,
      sameTopic: q?.sameTopic === '1' || q?.sameTopic === 'true',
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('questions')
  createQuestion(@CurrentUser() user: any, @Body() dto: CreateQuestionDto) {
    return this.bankService.createQuestion(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('questions/:id')
  getQuestion(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.getQuestion(user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch('questions/:id')
  updateQuestion(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.bankService.updateQuestion(user.id, id, dto);
  }

  // Xóa NHIỀU câu hỏi đã chọn (khai báo trước 'questions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('questions/batch')
  removeQuestions(@CurrentUser() user: any, @Body() body: { ids: string[] }) {
    return this.bankService.removeQuestions(user.id, body?.ids || []);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('questions/:id')
  removeQuestion(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.removeQuestion(user.id, id);
  }

  // ============ NHẬP ĐỀ TỪ .tex ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-tex')
  importTex(@CurrentUser() user: any, @Body() dto: ImportTexDto) {
    return this.bankService.importTex(user.id, dto.texSource);
  }

  // Bước 1: tách câu hỏi + AI phân loại thô → giáo viên duyệt
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-tex/preview')
  previewImport(@CurrentUser() user: any, @Body() dto: ImportTexDto) {
    return this.bankService.previewImport(user.id, dto.texSource);
  }

  // Bước 2: lưu sau khi giáo viên đã chỉnh phân loại
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-tex/confirm')
  confirmImport(@CurrentUser() user: any, @Body() body: any) {
    return this.bankService.confirmImport(
      user.id,
      body?.questions || [],
      body?.texSource || '',
    );
  }

  // ============ NHẬP ĐỀ THI HOÀN CHỈNH ============

  // Bước 1+2: tách câu hỏi + AI phân loại phần/chủ đề/lớp/độ khó
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-exam-preview')
  importExamPreview(@CurrentUser() user: any, @Body() dto: ImportTexDto) {
    return this.bankService.importExamPreview(user.id, dto.texSource);
  }

  // Bước 3+4: cấu hình điểm + lưu câu hỏi vào ngân hàng + tạo đề thi
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-exam-confirm')
  importExamConfirm(@CurrentUser() user: any, @Body() body: any) {
    return this.bankService.importExamConfirm(user.id, body);
  }

  // Phân tích lại 1 câu (GV sửa code inline ở bước phân loại)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('parse-question')
  parseQuestion(@CurrentUser() user: any, @Body() body: any) {
    return this.bankService.parseQuestionBlock(user.id, body?.tex);
  }

  // ============ NHẬP ĐỀ TỪ FILE WORD (.docx) — 0 TOKEN ============

  // Bước 1: tải file .docx → phân tích thành câu hỏi (chưa lưu)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-docx/preview')
  async previewDocxImport(@CurrentUser() user: any, @Req() req: any) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) {
      throw new Error('Không có file Word');
    }
    return this.bankService.previewDocxImport(user.id, buffer);
  }

  // Bước 2: xác nhận → lưu vào ngân hàng đề
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-docx/confirm')
  confirmDocxImport(@CurrentUser() user: any, @Body() body: any) {
    return this.bankService.confirmDocxImport(user.id, {
      questions: body?.questions || [],
      grade: body?.grade,
      topicName: body?.topicName,
    });
  }
}
