import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  buildTablePdf,
  buildXlsx,
  escapeTex,
  safeFilename,
} from '../common/export.helper';

@Controller('reports')
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  private async compileRaw(tex: string): Promise<Buffer> {
    const url = process.env.LATEX_SERVICE_URL || 'http://localhost:8080';
    const res = await fetch(`${url}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: tex }),
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new HttpException(
        String(err.error || 'Compile thất bại').slice(-500),
        500,
      );
    }
    return Buffer.from(await res.arrayBuffer());
  }

  // Danh sách lớp học (học sinh từng học khóa của giáo viên)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('classes')
  async listClasses(@CurrentUser() user: any) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { course: { teacherId: user.id } },
      include: { student: { select: { className: true } } },
    });
    const map = new Map<string, number>();
    for (const e of enrollments) {
      const c = e.student?.className?.trim() || 'Chưa phân lớp';
      map.set(c, (map.get(c) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }

  // Bảng điểm theo lớp: học sinh × các đề thi của giáo viên
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('class')
  async classScoreboard(
    @CurrentUser() user: any,
    @Query('name') className: string,
  ) {
    const name = (className || '').trim();
    if (!name) return { exams: [], students: [], className: name };

    const students = await this.prisma.user.findMany({
      where: { role: Role.STUDENT, className: name },
      select: {
        id: true,
        fullName: true,
        studentCode: true,
        className: true,
        xp: true,
        level: true,
      },
      orderBy: { fullName: 'asc' },
    });

    const exams = await this.prisma.exam.findMany({
      where: { teacherId: user.id },
      select: { id: true, title: true, totalScore: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        studentId: { in: students.map((s) => s.id) },
        examId: { in: exams.map((e) => e.id) },
        submittedAt: { not: null },
      },
    });

    const rows = students.map((s) => {
      const my = attempts.filter((a) => a.studentId === s.id);
      const scores: Record<string, number | null> = {};
      for (const ex of exams) {
        const list = my
          .filter((a) => a.examId === ex.id && a.score !== null)
          .map((a) => a.score as number);
        scores[ex.id] = list.length ? Math.max(...list) : null;
      }
      const earned = Object.values(scores).filter(
        (v): v is number => v !== null,
      );
      const avg = earned.length
        ? Math.round((earned.reduce((a, b) => a + b, 0) / earned.length) * 100) /
          100
        : null;
      return { student: s, scores, avg };
    });

    return { className: name, exams, students: rows };
  }

  // Xuất bảng điểm theo lớp (pdf | xlsx)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('class/export')
  async exportClassScoreboard(
    @CurrentUser() user: any,
    @Query('name') className: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const data = await this.classScoreboard(user, className);
    const f = format === 'xlsx' ? 'xlsx' : 'pdf';
    const baseName = safeFilename(`bang-diem-lop-${data.className}`);
    const headers = [
      'STT',
      'Họ tên',
      'Mã HS',
      ...data.exams.map((e: any) => e.title),
      'Trung bình',
    ];

    if (f === 'xlsx') {
      const sheetRows = data.students.map((s: any, i: number) => {
        const row: Record<string, any> = {
          STT: i + 1,
          'Họ tên': s.student.fullName,
          'Mã HS': s.student.studentCode || '—',
        };
        data.exams.forEach((e: any) => {
          row[e.title.slice(0, 30)] =
            s.scores[e.id] === null ? '—' : s.scores[e.id];
        });
        row['Trung bình'] = s.avg === null ? '—' : s.avg;
        return row;
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(baseName + '.xlsx')}`,
      );
      return res.send(buildXlsx('Bảng điểm lớp', sheetRows));
    }

    const tex = buildTablePdf(
      'BẢNG ĐIỂM THEO LỚP',
      `Lớp: ${data.className} — ${data.students.length} học sinh`,
      headers,
      data.students.map((s: any, i: number) => [
        String(i + 1),
        s.student.fullName,
        s.student.studentCode || '—',
        ...data.exams.map((e: any) =>
          s.scores[e.id] === null ? '—' : String(s.scores[e.id]),
        ),
        s.avg === null ? '—' : String(s.avg),
      ]),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(baseName + '.pdf')}`,
    );
    res.send(await this.compileRaw(tex));
  }

  // ============ PHIẾU ĐIỂM CÁ NHÂN HỌC SINH ============

  // Gom dữ liệu phiếu điểm của 1 học sinh (chỉ GV có liên quan)
  private async buildStudentReport(teacherId: string, studentId: string) {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: Role.STUDENT },
    });
    if (!student) throw new NotFoundException('Không tìm thấy học sinh');

    // Kiểm tra quan hệ: học sinh có học khóa của GV hoặc làm đề của GV
    const related = await this.prisma.$transaction([
      this.prisma.enrollment.count({
        where: { studentId, course: { teacherId } },
      }),
      this.prisma.examAttempt.count({
        where: { studentId, exam: { teacherId } },
      }),
    ]);
    if (related[0] === 0 && related[1] === 0) {
      throw new ForbiddenException('Học sinh này không thuộc lớp học của bạn');
    }

    const exams = await this.prisma.exam.findMany({
      where: { teacherId },
      select: { id: true, title: true, totalScore: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        studentId,
        examId: { in: exams.map((e) => e.id) },
        submittedAt: { not: null },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // Điểm cao nhất từng đề
    const scores: Record<string, { score: number; late: boolean; at: Date }> =
      {};
    for (const a of attempts) {
      const cur = scores[a.examId];
      if (!cur || (a.score ?? -1) > cur.score) {
        scores[a.examId] = {
          score: a.score ?? 0,
          late: a.late,
          at: a.submittedAt as Date,
        };
      }
    }

    const examRows = exams
      .filter((e) => scores[e.id])
      .map((e) => ({
        title: e.title,
        totalScore: e.totalScore,
        score: scores[e.id].score,
        late: scores[e.id].late,
        submittedAt: scores[e.id].at,
      }));

    const earned = examRows.map((r) => r.score);
    const avg = earned.length
      ? Math.round((earned.reduce((a, b) => a + b, 0) / earned.length) * 100) / 100
      : null;

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId, course: { teacherId } },
      include: { course: { select: { title: true } } },
      orderBy: { enrolledAt: 'desc' },
    });

    // Nhận xét AI từ lần phân tích gần nhất
    const lastWithAnalysis = attempts.find(
      (a) => (a.perPart as any)?.aiAnalysis,
    );
    const aiAnalysis = lastWithAnalysis
      ? (lastWithAnalysis.perPart as any).aiAnalysis
      : null;

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        studentCode: student.studentCode,
        className: student.className,
        school: student.school,
        xp: student.xp,
        level: student.level,
      },
      examRows,
      avg,
      totalDone: examRows.length,
      totalExams: exams.length,
      enrollments: enrollments.map((en) => ({
        courseTitle: en.course.title,
        progress: en.progress,
        enrolledAt: en.enrolledAt,
      })),
      aiAnalysis,
      generatedAt: new Date(),
    };
  }

  // Phiếu điểm dạng JSON (xem trên web)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('student/:studentId')
  async studentReport(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
  ) {
    return this.buildStudentReport(user.id, studentId);
  }

  // Phiếu điểm dạng PDF (cho phụ huynh)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('student/:studentId/pdf')
  async studentReportPdf(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Res() res: Response,
  ) {
    const r = await this.buildStudentReport(user.id, studentId);

    const lines: string[] = [
      '\\documentclass[12pt,a4paper]{article}',
      '\\usepackage{vntex}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      '\\usepackage{longtable}',
      '\\usepackage{geometry}',
      '\\geometry{margin=1.8cm}',
      '\\begin{document}',
      '\\begin{center}',
      '{\\Large\\bfseries PHIẾU ĐIỂM HỌC SINH} \\\\[6pt]',
      `{\\large ${escapeTex(r.student.fullName)}} \\\\[2pt]`,
      `Mã học sinh: ${escapeTex(r.student.studentCode || '—')} \\quad Lớp: ${escapeTex(r.student.className || '—')} \\quad Trường: ${escapeTex(r.student.school || '—')}`,
      '\\end{center}',
      '\\vspace{6pt}',
      '\\section*{Kết quả các bài kiểm tra}',
    ];

    if (r.examRows.length === 0) {
      lines.push('Chưa có bài kiểm tra nào được nộp.');
    } else {
      lines.push(
        `Tổng số bài đã làm: ${r.examRows.length}/${r.totalExams} — Điểm trung bình: ${r.avg ?? '—'}`,
      );
      lines.push('\\vspace{4pt}');
      lines.push('\\begin{longtable}{|p{8.5cm}|c|c|c|}');
      lines.push('\\hline');
      lines.push(
        '\\textbf{Đề thi} & \\textbf{Điểm} & \\textbf{Trạng thái} & \\textbf{Thời gian} \\\\ \\hline',
      );
      lines.push('\\endfirsthead');
      lines.push('\\hline');
      lines.push(
        '\\textbf{Đề thi} & \\textbf{Điểm} & \\textbf{Trạng thái} & \\textbf{Thời gian} \\\\ \\hline',
      );
      lines.push('\\endhead');
      lines.push('\\hline');
      lines.push('\\endfoot');
      for (const row of r.examRows) {
        const status = row.late
          ? 'Nộp muộn'
          : row.score >= row.totalScore * 0.5
            ? 'Đạt'
            : 'Chưa đạt';
        lines.push(
          `${escapeTex(row.title)} & ${row.score}/${row.totalScore} & ${status} & ${new Date(row.submittedAt).toLocaleDateString('vi-VN')} \\\\ \\hline`,
        );
      }
      lines.push('\\end{longtable}');
    }

    if (r.enrollments.length) {
      lines.push('\\section*{Tiến độ khóa học}');
      lines.push('\\begin{longtable}{|p{9cm}|c|c|}');
      lines.push('\\hline');
      lines.push(
        '\\textbf{Khóa học} & \\textbf{Tiến độ} & \\textbf{Đăng ký} \\\\ \\hline',
      );
      lines.push('\\endfirsthead');
      lines.push('\\hline');
      lines.push(
        '\\textbf{Khóa học} & \\textbf{Tiến độ} & \\textbf{Đăng ký} \\\\ \\hline',
      );
      lines.push('\\endhead');
      lines.push('\\hline');
      lines.push('\\endfoot');
      for (const en of r.enrollments) {
        lines.push(
          `${escapeTex(en.courseTitle)} & ${Math.round((en.progress ?? 0) * 100)}\\% & ${new Date(en.enrolledAt).toLocaleDateString('vi-VN')} \\\\ \\hline`,
        );
      }
      lines.push('\\end{longtable}');
    }

    if (r.aiAnalysis) {
      const a = r.aiAnalysis;
      lines.push('\\section*{Nhận xét của thầy cô}');
      if (a.strengths?.length) {
        lines.push('\\textbf{Điểm mạnh:}');
        lines.push('\\begin{itemize}');
        for (const s of a.strengths) lines.push(`\\item ${escapeTex(s)}`);
        lines.push('\\end{itemize}');
      }
      if (a.weaknesses?.length) {
        lines.push('\\textbf{Cần cải thiện:}');
        lines.push('\\begin{itemize}');
        for (const w of a.weaknesses) lines.push(`\\item ${escapeTex(w)}`);
        lines.push('\\end{itemize}');
      }
      if (a.advice) {
        lines.push(`\\textbf{Lời khuyên:} ${escapeTex(a.advice)}`);
      }
    }

    lines.push('\\vspace{10pt}');
    lines.push(
      `\\hfill \\textit{Ngày in: ${new Date().toLocaleDateString('vi-VN')} — LumiMath}`,
    );
    lines.push('\\end{document}');

    const tex = lines.join('\n');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(
        safeFilename(`phieu-diem-${r.student.fullName}`) + '.pdf',
      )}`,
    );
    res.send(await this.compileRaw(tex));
  }
}
