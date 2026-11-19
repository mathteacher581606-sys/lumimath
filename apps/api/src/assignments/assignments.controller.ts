import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('courses/:courseId/assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    return this.assignments.list(courseId, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.create(courseId, user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id')
  update(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.update(courseId, id, user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.remove(courseId, id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  detail(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.detail(courseId, id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/submit')
  submit(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.submit(courseId, id, user.id, body);
  }

  // HS làm đề qua giao diện thi online → bấm nộp kết quả vào bài giao
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/submit-exam')
  submitExamResult(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.submitExamResult(courseId, id, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/submissions/:submissionId/grade')
  grade(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.grade(courseId, id, submissionId, user.id, body);
  }

  // Lịch sử các lần nộp/sửa (GV xem của HS, HS xem của chính mình)
  @UseGuards(JwtAuthGuard)
  @Get(':id/submissions/:submissionId/history')
  submissionHistory(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.submissionHistory(
      courseId,
      id,
      submissionId,
      user.id,
    );
  }

  // GV xem bài làm đề thi của học sinh (trắc nghiệm + tự luận) để chấm
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/submissions/:submissionId/exam-review')
  examReview(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.examReview(courseId, id, submissionId, user.id);
  }

  // GV bấm nút → AI chấm các câu TỰ LUẬN (trắc nghiệm tính tự động)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/submissions/:submissionId/ai-grade')
  aiGrade(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.aiGrade(courseId, id, submissionId, user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/submissions/:submissionId/return')
  returnSubmission(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.returnSubmission(
      courseId,
      id,
      submissionId,
      user.id,
      body?.note,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/submissions/:submissionId/annotations')
  saveAnnotations(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @Param('submissionId') submissionId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.saveAnnotations(
      courseId,
      id,
      submissionId,
      user.id,
      body?.annotations,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/leaderboard')
  leaderboard(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.leaderboard(courseId, id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/notify-email')
  notifyEmail(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.notifyEmail(courseId, id, user.id, body);
  }

  // Post policy: công bố / ẩn điểm đồng loạt + hẹn giờ
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/post-grades')
  postGrades(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.assignments.postGrades(courseId, id, user.id, body);
  }

  // Chấm lại toàn bộ bài làm của bài tập này (đề thi gán vào khóa học)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/regrade')
  regradeAssignment(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.assignments.regradeAssignment(courseId, id, user.id);
  }

  // Xuất bảng điểm của bài tập (PDF / Excel)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/scores/export')
  async exportScores(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('format') format: string,
    @Query('className') className: string,
    @Res() res: Response,
  ) {
    const f = format === 'xlsx' ? 'xlsx' : 'pdf';
    const { buffer, filename, contentType } =
      await this.assignments.exportScores(courseId, id, user.id, f, className);
    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.send(buffer);
  }
}

// Tự động đồng bộ điểm thi vào các bài giao (gọi ngay sau khi HS nộp bài thi)
@Controller('exam-assignments')
export class ExamAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':examId/sync')
  sync(@Param('examId') examId: string, @CurrentUser() user: any) {
    return this.assignments.autoSyncExam(user.id, examId);
  }
}
