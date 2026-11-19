import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { ExamsService } from './exams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExamDto } from './dto/create-exam.dto';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ===== Giới hạn biên dịch (chống làm treo TeX Live / đầy ổ đĩa) =====
  // Mỗi tài khoản: tối đa N lần biên dịch / 10 phút (ảnh đã có trong bộ nhớ đệm vẫn được tính
  // vì không biết trước) — học sinh 60, giáo viên 400.
  private static compileHits = new Map<string, number[]>();
  private rateLimit(user: any, limit?: number) {
    const max = limit ?? (user?.role === 'STUDENT' ? 60 : 400);
    const now = Date.now();
    const key = String(user?.id || 'anon');
    const arr = (ExamsController.compileHits.get(key) || []).filter((t) => now - t < 600000);
    if (arr.length >= max) {
      throw new HttpException('Bạn biên dịch quá nhiều trong thời gian ngắn, thử lại sau ít phút', 429);
    }
    arr.push(now);
    ExamsController.compileHits.set(key, arr);
    if (ExamsController.compileHits.size > 5000) ExamsController.compileHits.clear();
  }

  private checkSnippet(user: any, snippet: any): string {
    const s = String(snippet || '');
    if (s.length > 20000) throw new HttpException('Đoạn LaTeX quá dài (tối đa 20.000 ký tự)', 413);
    this.rateLimit(user);
    return s;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateExamDto) {
    return this.examsService.create(user.id, dto);
  }

  // SINH ĐỀ (chưa lưu) để giáo viên DUYỆT từng câu trước khi lưu đề
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('generate')
  generate(@CurrentUser() user: any, @Body() dto: CreateExamDto) {
    return this.examsService.generate(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get()
  findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.examsService.findAll(user.id, query);
  }

  // ============ THƯ MỤC ĐỀ THI (cây mục lục Kho đề thi) ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('folders')
  listFolders(@CurrentUser() user: any) {
    return this.examsService.listFolders(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('folders')
  createFolder(@CurrentUser() user: any, @Body() body: any) {
    return this.examsService.createFolder(user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch('folders/:id')
  updateFolder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.updateFolder(user.id, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('folders/:id')
  deleteFolder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.deleteFolder(user.id, id);
  }

  // Đề thi công khai cho học sinh (thi thử)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('available')
  listAvailable(@CurrentUser() user: any, @Query('grade') grade?: string) {
    return this.examsService.listAvailableForStudent(
      user.id,
      grade ? Number(grade) : undefined,
    );
  }

  // Phòng luyện đề (TSA/HSA)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('practice-room')
  listPracticeRoom(@CurrentUser() user: any, @Query('kind') kind?: string) {
    return this.examsService.listPracticeRoom(user.id, kind || 'PRACTICE_TSA');
  }

  // Lịch sử làm bài của tôi (phải khai báo trước :id)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('attempts/my')
  myAttempts(@CurrentUser() user: any) {
    return this.examsService.myAttempts(user.id);
  }

  // Gợi ý ôn tập cá nhân hóa (phải khai báo trước :id)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('practice/recommend')
  recommendPractice(@CurrentUser() user: any) {
    return this.examsService.recommendPractice(user.id);
  }

  // Tạo đề luyện tập từ chủ đề yếu
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post('practice')
  createPractice(
    @CurrentUser() user: any,
    @Body() body: { count?: number },
  ) {
    return this.examsService.createPractice(user.id, body?.count ?? 10);
  }

  // Danh sách chủ đề khả dụng để luyện nhanh
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('practice/topics')
  practiceTopics(@CurrentUser() user: any) {
    return this.examsService.practiceTopics(user.id);
  }

  // Tạo đề luyện nhanh theo chủ đề tự chọn
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post('quick-practice')
  createQuickPractice(@CurrentUser() user: any, @Body() body: any) {
    return this.examsService.createQuickPractice(user.id, body);
  }

  // Giao bài hàng loạt cho nhiều khóa học (giáo viên)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/assign-bulk')
  assignBulk(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.assignBulk(
      user.id,
      id,
      body?.courseIds || [],
      body?.deadline,
      body?.title,
    );
  }

  // Dashboard học sinh (streak + bài tập đến hạn + hoạt động)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('dashboard')
  studentDashboard(@CurrentUser() user: any) {
    return this.examsService.studentDashboard(user.id);
  }

  // Tạo đề từ template (giáo viên)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('from-template/:id')
  createFromTemplate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { title?: string },
  ) {
    return this.examsService.createFromTemplate(user.id, id, body?.title || '');
  }

  // Chi tiết một lần làm bài (học sinh xem lại)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get(':id/attempts/:attemptId')
  getAttemptDetail(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.examsService.getAttemptDetail(user.id, id, attemptId);
  }

  // Tải PDF "ĐÁP ÁN & LỜI GIẢI" của một bài làm (học sinh tự tải lại từ lịch sử)
  // PDF được biên dịch qua TeX Live với chế độ TỰ ĐỘNG SỬA LỖI LaTeX.
  @UseGuards(JwtAuthGuard)
  @Get(':id/attempts/:attemptId/answers-pdf')
  async attemptAnswersPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename, fixes } =
      await this.examsService.buildAttemptAnswersPdf(user.id, id, attemptId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    // Cho biết bộ tự sửa LaTeX đã can thiệp những gì (để chẩn đoán/đối chiếu)
    if (fixes && fixes.length) {
      res.setHeader(
        'X-Latex-Autofix',
        encodeURIComponent(fixes.join(' | ')).slice(0, 900),
      );
    }
    res.setHeader('X-Latex-Autofix-Count', String(fixes?.length || 0));
    res.send(buffer);
  }

  // Xem bài làm của học sinh (giáo viên chấm/xem lại)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/attempts/:attemptId/review')
  reviewAttempt(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
  ) {
    return this.examsService.reviewAttempt(user.id, id, attemptId);
  }

  // Giáo viên chốt điểm câu tự luận trong bài thi
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/attempts/:attemptId/essays/:itemId/review')
  reviewEssay(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
  ) {
    return this.examsService.reviewEssay(user.id, id, attemptId, itemId, {
      finalScore: body?.finalScore,
      finalComment: body?.finalComment,
    });
  }

  // Cập nhật meta đề thi (title / công khai / template)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id')
  updateExam(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.updateExam(user.id, id, body);
  }

  // Bảng điểm của đề thi (giáo viên) — lọc theo lớp
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/results')
  getResults(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('className') className?: string,
  ) {
    return this.examsService.getResults(user.id, id, className);
  }

  // Xuất bảng điểm đề thi (pdf | xlsx) — lọc theo lớp
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/results/export')
  async exportResults(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('format') format: string,
    @Query('className') className: string,
    @Res() res: Response,
  ) {
    const f = format === 'xlsx' ? 'xlsx' : 'pdf';
    const { buffer, filename, contentType } =
      await this.examsService.exportResults(user.id, id, f, className);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  // Bắt đầu làm bài thi
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/start')
  startAttempt(@Param('id') id: string, @CurrentUser() user: any) {
    return this.examsService.startAttempt(id, user.id);
  }

  // Nộp bài thi (chấm điểm tự động)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/submit')
  submitAttempt(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.examsService.submitAttempt(
      id,
      user.id,
      body?.attemptId,
      body?.answers,
      body?.timeSpent,
    );
  }

  // Tự lưu tiến trình giữa chừng
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/attempts/:attemptId/autosave')
  autosaveAttempt(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.examsService.autosaveAttempt(
      id,
      user.id,
      attemptId,
      body?.answers,
      body?.timeSpent,
    );
  }

  // Chấm ngay 1 câu (chế độ luyện tập / xem đáp án từng câu)
  @UseGuards(JwtAuthGuard)
  @Post(':id/check')
  checkAnswer(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.examsService.checkAnswer(id, body?.itemId, body?.answer, user.id);
  }

  // GV nới điểm tay (fudge points)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id/attempts/:attemptId/fudge')
  setFudgePoints(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.examsService.setFudgePoints(id, user.id, attemptId, body?.fudgePoints);
  }

  // Chấm lại sau khi sửa đề
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/attempts/:attemptId/regrade')
  regradeAttempt(
    @Param('id') id: string,
    @Param('attemptId') attemptId: string,
    @CurrentUser() user: any,
  ) {
    return this.examsService.regradeAttempt(id, user.id, attemptId);
  }

  // Chấm lại TOÀN BỘ bài đã nộp của đề
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/regrade-all')
  regradeExam(@Param('id') id: string, @CurrentUser() user: any) {
    return this.examsService.regradeExam(id, user.id);
  }

  // Item analysis (thống kê câu hỏi)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/statistics')
  statistics(@Param('id') id: string, @CurrentUser() user: any) {
    return this.examsService.statistics(id, user.id);
  }

  // GV cập nhật thiết lập thi (pass_mark, practice, cổng đáp án...)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.examsService.updateSettings(id, user.id, body);
  }

  // ============ KHO MA TRẬN ĐỀ (phải khai báo trước ':id') ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('matrices')
  listMatrices(@CurrentUser() user: any) {
    return this.examsService.listMatrices(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('matrices')
  saveMatrix(@CurrentUser() user: any, @Body() body: any) {
    return this.examsService.saveMatrix(user.id, body);
  }

  // Tải file mẫu ma trận (8 cột mới) để giáo viên điền
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('matrices/export-template')
  async exportMatrixTemplate(@CurrentUser() user: any, @Res() res: any) {
    const { buffer, filename } = await this.examsService.exportMatrixTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('matrices/:id')
  deleteMatrix(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.deleteMatrix(user.id, id);
  }

  // Nhập ma trận từ file Excel (raw body = file .xlsx)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('matrices/import-excel')
  async importMatrixExcel(@CurrentUser() user: any, @Req() req: any) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new BadRequestException('Không có file Excel');
    return this.examsService.importMatrixExcel(user.id, buffer);
  }

  // Xuất ma trận ra file Excel
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('matrices/export-excel')
  async exportMatrixExcel(
    @CurrentUser() user: any,
    @Body() body: any,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.examsService.exportMatrixExcel(
      user.id,
      body,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.findOne(user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string, @Query('mode') mode?: string) {
    return this.examsService.remove(user.id, id, mode);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/restore')
  restore(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.restore(user.id, id);
  }

  // Tải file .tex
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/tex')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="exam.tex"')
  getTex(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.getTex(user.id, id);
  }

  // Tải đề thi .docx (không tốn token AI)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/docx')
  async exportDocx(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.examsService.exportDocx(
      user.id,
      id,
      false,
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

  // Tải đáp án .docx (chỉ giáo viên)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/docx-answers')
  async exportDocxAnswers(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.examsService.exportDocx(
      user.id,
      id,
      true,
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

  // Tải đề .docx dạng CÚ PHÁP TEX — MathType Convert Equations (nguồn TeX) → Toggle TeX
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/docx-tex')
  async exportDocxTex(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.examsService.exportDocx(
      user.id,
      id,
      false,
      'tex',
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

  // Tải đáp án .docx dạng cú pháp TeX
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/docx-answers-tex')
  async exportDocxAnswersTex(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.examsService.exportDocx(
      user.id,
      id,
      true,
      'tex',
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

  // Compile PDF
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/compile')
  @Header('Content-Type', 'application/pdf')
  async compile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.examsService.compile(user.id, id);
    res.setHeader('Content-Disposition', 'attachment; filename="exam.pdf"');
    res.send(pdf);
  }

  // Sửa nội dung/đáp án câu hỏi ngay trong đề (cập nhật luôn ngân hàng câu hỏi)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id/items/:itemId/question')
  updateItemQuestion(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
  ) {
    return this.examsService.updateItemQuestion(user.id, id, itemId, body || {});
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/items/:itemId/usage')
  itemUsage(@CurrentUser() user: any, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.examsService.itemQuestionUsage(user.id, id, itemId);
  }

  // Biên dịch thử LaTeX bất kỳ (tự bọc preamble nếu là snippet, hỗ trợ TikZ)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('compile-preview')
  @Header('Content-Type', 'application/pdf')
  async compilePreview(@CurrentUser() user: any, @Body() body: any, @Res() res: Response) {
    this.rateLimit(user, 120);
    const pdf = await this.examsService.compileSmart(body?.source || '');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(pdf);
  }

  // Biên dịch block TikZ riêng lẻ → ảnh PNG (GV + HS dùng khi xem câu hỏi)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('compile-tikz')
  @Header('Content-Type', 'image/png')
  async compileTikz(@CurrentUser() user: any, @Body() body: any, @Res() res: Response) {
    const snippet = this.checkSnippet(user, body?.snippet);
    const png = await this.examsService.compileTikzSnippet(snippet, {
      persist: user?.role !== 'STUDENT',
    });
    res.setHeader('Content-Disposition', 'inline; filename="tikz.png"');
    res.send(png);
  }

  // Dự phòng: biên dịch 1 công thức toán bằng TeX Live → PNG
  // (dùng khi KaTeX trên web không render được macro lạ)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('compile-math')
  @Header('Content-Type', 'image/png')
  async compileMath(@CurrentUser() user: any, @Body() body: any, @Res() res: Response) {
    const png = await this.examsService.compileMathSnippet(this.checkSnippet(user, body?.latex));
    res.setHeader('Content-Disposition', 'inline; filename="math.png"');
    res.send(png);
  }

  // Dự phòng: biên dịch 1 ĐOẠN LaTeX (enumerate/center/itemize/itemchoice...) bằng TeX Live → PNG
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('compile-latex')
  @Header('Content-Type', 'image/png')
  async compileLatex(@CurrentUser() user: any, @Body() body: any, @Res() res: Response) {
    const png = await this.examsService.compileLatexSnippet(this.checkSnippet(user, body?.latex));
    res.setHeader('Content-Disposition', 'inline; filename="latex.png"');
    res.send(png);
  }

  // Gán đề thi vào bài giảng → BTVN online
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/assign')
  assign(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.examsService.assignToLesson(id, body?.lessonId, user.id);
  }

  // Bỏ gán đề thi khỏi bài giảng
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id/unassign/:lessonId')
  unassign(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.examsService.unassignFromLesson(lessonId, user.id);
  }

  // Tải PDF đáp án (GV luôn được; HS chỉ sau khi nộp bài)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id/answers-pdf')
  @Header('Content-Type', 'application/pdf')
  async answersPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.examsService.downloadAnswersPdf(user, id);
    res.setHeader('Content-Disposition', 'attachment; filename="dap_an.pdf"');
    res.send(pdf);
  }

  // Sửa câu hỏi trong đề (đổi điểm / đổi câu hỏi)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
  ) {
    return this.examsService.updateItem(user.id, id, itemId, {
      score: body?.score,
      questionId: body?.questionId,
    });
  }

  // Xóa câu hỏi khỏi đề
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id/items/:itemId')
  removeItem(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.examsService.removeItem(user.id, id, itemId);
  }
}
