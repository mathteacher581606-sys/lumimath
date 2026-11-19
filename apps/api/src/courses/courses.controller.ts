import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.coursesService.findAll(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  myCourses(@CurrentUser() user: any) {
    return this.coursesService.myCourses(user.id);
  }

  // Nhiệm vụ tuần của học sinh (khai báo TRƯỚC ':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my-weekly-tasks')
  weeklyTasks(@CurrentUser() user: any) {
    return this.coursesService.weeklyTasks(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.coursesService.findOne(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.coursesService.remove(id, user.id);
  }

  // ============ BÀI GIẢNG ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':courseId/lessons')
  createLesson(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateLessonDto,
  ) {
    return this.coursesService.createLesson(courseId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':courseId/lessons/:lessonId')
  updateLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.coursesService.updateLesson(lessonId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':courseId/lessons/:lessonId')
  removeLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.removeLesson(lessonId, user.id);
  }

  // ============ CHƯƠNG (sửa tên + sắp xếp lại thứ tự) ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':courseId/chapters/rename')
  renameChapter(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: { oldTitle?: string; newTitle?: string },
  ) {
    return this.coursesService.renameChapter(
      courseId,
      user.id,
      body?.oldTitle || '',
      body?.newTitle || '',
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':courseId/chapters/reorder')
  reorderChapters(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: { order?: string[] },
  ) {
    return this.coursesService.reorderChapters(
      courseId,
      user.id,
      Array.isArray(body?.order) ? body!.order : [],
    );
  }

  // Sao chép bài giảng từ khóa học khác vào khóa học này
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':courseId/copy-lessons')
  copyLessons(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.copyLessons(
      courseId,
      user.id,
      body?.sourceCourseId,
      Array.isArray(body?.lessonIds) ? body.lessonIds : [],
    );
  }

  // ============ ĐĂNG KÝ ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/enroll')
  enroll(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.enroll(id, user.id, body?.password);
  }

  // ============ QUIZ CỦNG CỐ TRONG BÀI GIẢNG ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Put(':courseId/lessons/:lessonId/quiz')
  saveLessonQuiz(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.saveLessonQuiz(courseId, lessonId, user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':courseId/lessons/:lessonId/quiz')
  getLessonQuiz(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
  ) {
    return user.role === Role.TEACHER
      ? this.coursesService.getLessonQuiz(courseId, lessonId)
      : this.coursesService.getLessonQuizForStudent(courseId, lessonId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':courseId/lessons/:lessonId/quiz/submit')
  submitLessonQuiz(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.submitLessonQuiz(courseId, lessonId, user.id, body);
  }

  // ============ GHI CHÚ CÁ NHÂN ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get(':courseId/lessons/:lessonId/note')
  getLessonNote(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.getLessonNote(lessonId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Put(':courseId/lessons/:lessonId/note')
  saveLessonNote(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() body: { content?: string },
  ) {
    return this.coursesService.saveLessonNote(lessonId, user.id, body?.content || '');
  }

  // ============ SỐ LIỆU TỪNG BÀI (GIÁO VIÊN) ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/lesson-stats')
  lessonStats(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.lessonStats(courseId, user.id);
  }

  // ============ THỐNG KÊ HOẠT ĐỘNG HỌC SINH ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/activity')
  courseActivity(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.courseActivity(courseId, user.id);
  }

  // ============ CHỨNG CHỈ HOÀN THÀNH ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get(':courseId/certificate')
  async certificate(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const { buffer, filename, contentType } =
      await this.coursesService.certificatePdf(courseId, user.id);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  // ============ TIẾN ĐỘ HỌC TẬP ============

  // Đánh dấu bài giảng đã học xong / chưa xong
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':courseId/lessons/:lessonId/complete')
  markLessonComplete(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.markLessonComplete(
      courseId,
      lessonId,
      user.id,
      body?.completed !== false,
    );
  }

  // Xem tiến độ khóa học
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get(':courseId/progress')
  getCourseProgress(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.getCourseProgress(courseId, user.id);
  }

  // ============ QUẢN LÝ HỌC SINH (GIÁO VIÊN) ============

  // Danh sách học sinh của khóa học
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/students')
  listStudents(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.listStudents(courseId, user.id);
  }

  // Tải file mẫu nhập học sinh bằng Excel
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/import-students/template')
  importStudentsTemplate(@Res() res: Response) {
    const buffer = this.coursesService.importStudentsTemplateBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('mau-nhap-hoc-sinh-khoa-hoc.xlsx')}`,
    );
    res.send(buffer);
  }

  // Nhập học sinh vào khóa học từ file Excel (.xlsx)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':courseId/import-students')
  async importStudents(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return this.coursesService.importStudents(
      courseId,
      user.id,
      Buffer.concat(chunks),
    );
  }

  // ============ TRỢ GIẢNG (chỉ chủ khóa học quản lý) ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/assistants')
  listAssistants(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.listAssistants(courseId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':courseId/assistants')
  addAssistant(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.addAssistant(courseId, user.id, body?.email || '');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':courseId/assistants/:assistantId')
  removeAssistant(
    @Param('courseId') courseId: string,
    @Param('assistantId') assistantId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.removeAssistant(courseId, user.id, assistantId);
  }

  // Gỡ học sinh khỏi khóa học
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':courseId/students/:studentId')
  removeStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.removeStudent(courseId, user.id, studentId);
  }

  // Sửa thông tin tài khoản học sinh đã đăng ký khóa học
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':courseId/students/:studentId')
  updateStudent(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.coursesService.updateStudent(courseId, user.id, studentId, body);
  }

  // Bảng điểm khóa học (giáo viên)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/results')
  getCourseResults(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.getCourseResults(courseId, user.id);
  }

  // Xuất bảng điểm khóa học (pdf | xlsx)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':courseId/results/export')
  async exportCourseResults(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const f = format === 'xlsx' ? 'xlsx' : 'pdf';
    const { buffer, filename, contentType } =
      await this.coursesService.exportCourseResults(courseId, user.id, f);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }

  // ============ THẢO LUẬN BÀI GIẢNG ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':courseId/lessons/:lessonId/comments')
  listComments(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.listComments(
      courseId,
      lessonId,
      user.id,
      user.role,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':courseId/lessons/:lessonId/comments')
  addComment(
    @Param('courseId') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() body: { content?: string },
  ) {
    return this.coursesService.addComment(
      courseId,
      lessonId,
      user.id,
      user.role,
      body?.content || '',
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete('comments/:commentId')
  removeComment(
    @Param('commentId') commentId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.removeComment(commentId, user.id, user.role);
  }

  // ============ ĐÁNH GIÁ KHÓA HỌC ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':courseId/review')
  addReview(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: { rating?: number; comment?: string },
  ) {
    return this.coursesService.addReview(
      courseId,
      user.id,
      body?.rating ?? 5,
      body?.comment,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':courseId/reviews')
  listReviews(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.listReviews(courseId, user.id, user.role);
  }
}
