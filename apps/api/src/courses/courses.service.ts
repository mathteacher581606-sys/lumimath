import {
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { buildTablePdf, buildXlsx, safeFilename } from '../common/export.helper';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  // Biên dịch LaTeX thành PDF (dùng chung với export bảng điểm)
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

  // ============ KHÓA HỌC ============

  async create(teacherId: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        teacherId,
        title: dto.title,
        description: dto.description,
        coverUrl: dto.coverUrl,
        bannerUrl: (dto as any).bannerUrl,
        grade: dto.grade,
        subject: dto.subject ?? 'Toán',
        isPublished: dto.isPublished ?? false,
        password: dto.password,
      },
    });
  }

  async findAll(user: { id: string; role: Role }) {
    if (user.role === Role.TEACHER) {
      return this.prisma.course.findMany({
        where: { teacherId: user.id },
        include: {
          _count: { select: { lessons: true, enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.course.findMany({
      where: { isPublished: true },
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user?: any) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        lessons: {
          orderBy: { order: 'asc' },
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                duration: true,
                totalScore: true,
                grade: true,
                difficulty: true,
              },
            },
            _count: { select: { progresses: true } },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    const isOwner = user?.role === 'TEACHER' && (course as any).teacherId === user.id;
    let enrolled = true;
    if (user?.role === 'STUDENT' && !isOwner) {
      const en = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId: id, studentId: user.id } },
      });
      enrolled = !!en;
    }

    if (!isOwner && !enrolled) {
      // Chưa đăng ký: chỉ xem được bài "xem thử miễn phí", còn lại khóa nội dung
      const lessons = (course as any).lessons.map((l: any) => {
        if (l.isPreviewFree) return l;
        return {
          id: l.id,
          title: l.title,
          order: l.order,
          chapter: l.chapter,
          isPreviewFree: false,
          locked: true,
          exam: null,
          _count: null,
        };
      });
      return { ...course, lessons, enrolled: false };
    }

    return { ...course, enrolled };
  }

  async update(id: string, teacherId: string, dto: UpdateCourseDto) {
    await this.getOwnedCourse(id, teacherId);
    return this.prisma.course.update({ where: { id }, data: { ...dto } });
  }

  private escapeLatex(s: string): string {
    return String(s || '')
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/_/g, '\\_')
      .replace(/&/g, '\\&')
      .replace(/%/g, '\\%')
      .replace(/#/g, '\\#');
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ============ QUIZ CỦNG CỐ TRONG BÀI GIẢNG ============

  // GV lưu cấu hình quiz (đề thi + số câu + ngưỡng đạt %)
  async saveLessonQuiz(
    courseId: string,
    lessonId: string,
    teacherId: string,
    body: any,
  ) {
    await this.getOwnedCourse(courseId, teacherId);
    const exam = await this.prisma.exam.findFirst({
      where: { id: String(body?.examId || ''), teacherId },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy đề thi');
    const data = {
      examId: exam.id,
      questionCount: Math.min(30, Math.max(1, Number(body?.questionCount) || 5)),
      passingPercent: Math.min(100, Math.max(0, Number(body?.passingPercent) ?? 50)),
      negativeMarking: !!body?.negativeMarking,
      negativeWeight: Math.min(100, Math.max(0, Number(body?.negativeWeight) || 0)),
      maxAttempts: Math.min(100, Math.max(0, Number(body?.maxAttempts) || 0)),
    };
    return this.prisma.lessonQuiz.upsert({
      where: { lessonId },
      update: data,
      create: { lessonId, ...data },
    });
  }

  // GV xem cấu hình + thống kê lượt làm quiz của bài
  async getLessonQuiz(courseId: string, lessonId: string) {
    const quiz = await this.prisma.lessonQuiz.findUnique({
      where: { lessonId },
      include: {
        attempts: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!quiz) return null;
    const students = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: { select: { id: true, fullName: true } } },
    });
    const byStudent = new Map<string, any[]>();
    for (const a of quiz.attempts) {
      if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, []);
      byStudent.get(a.studentId)!.push(a);
    }
    return {
      ...quiz,
      attempts: undefined,
      summary: students.map((e) => {
        const list = byStudent.get(e.studentId) || [];
        const best = list.reduce<number>((m, a) => Math.max(m, a.score), -1);
        return {
          student: e.student,
          attempts: list.length,
          best: best >= 0 ? best : null,
          passed: list.some((a) => a.passed),
        };
      }),
    };
  }

  // HS lấy đề quiz (trộn câu, KHÔNG kèm đáp án)
  async getLessonQuizForStudent(courseId: string, lessonId: string, studentId: string) {
    const quiz = await this.prisma.lessonQuiz.findUnique({ where: { lessonId } });
    if (!quiz) return null;
    const items = await this.prisma.examItem.findMany({
      where: { examId: quiz.examId, question: { type: 'MCQ' } },
      include: { question: true },
    });
    const pool = items.map((i) => i.question);
    const picked = this.shuffle(pool).slice(0, quiz.questionCount);
    const best = await this.prisma.lessonQuizAttempt.findFirst({
      where: { quizId: quiz.id, studentId },
      orderBy: { score: 'desc' },
    });
    const attempts = await this.prisma.lessonQuizAttempt.findMany({
      where: { quizId: quiz.id, studentId },
      orderBy: { createdAt: 'desc' },
      select: { score: true, passed: true, createdAt: true },
    });
    const usedAttempts = attempts.length;
    const remaining =
      quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - usedAttempts) : null;
    return {
      quizId: quiz.id,
      questionCount: quiz.questionCount,
      passingPercent: quiz.passingPercent,
      negativeMarking: quiz.negativeMarking,
      negativeWeight: quiz.negativeWeight,
      maxAttempts: quiz.maxAttempts,
      usedAttempts,
      remaining,
      bestScore: best?.score ?? null,
      history: attempts,
      questions: picked.map((q: any) => ({
        id: q.id,
        content: q.content,
        options: q.options,
      })),
    };
  }

  // HS nộp bài quiz → chấm ngay, lưu lượt làm
  async submitLessonQuiz(
    courseId: string,
    lessonId: string,
    studentId: string,
    body: any,
  ) {
    const quiz = await this.prisma.lessonQuiz.findUnique({ where: { lessonId } });
    if (!quiz) throw new NotFoundException('Bài giảng không có quiz');
    // Giới hạn số lần làm
    if (quiz.maxAttempts > 0) {
      const used = await this.prisma.lessonQuizAttempt.count({
        where: { quizId: quiz.id, studentId },
      });
      if (used >= quiz.maxAttempts) {
        throw new ForbiddenException(
          `Bạn đã hết ${quiz.maxAttempts} lượt làm quiz này`,
        );
      }
    }
    const answers: Record<string, string> = body?.answers || {};
    const ids = Object.keys(answers).slice(0, 50);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: ids } },
    });
    let correct = 0;
    const results = questions.map((q: any) => {
      const ok = answers[q.id] === q.answer;
      if (ok) correct++;
      return {
        id: q.id,
        correct: ok,
        your: answers[q.id] ?? null,
        answer: q.answer,
        solution: q.solution || null,
      };
    });
    const total = questions.length;
    const wrong = total - correct;
    // Điểm cơ bản theo % số câu đúng; trừ điểm sai nếu bật negativeMarking
    let score = total ? Math.round((correct / total) * 100) : 0;
    let penalty = 0;
    if (quiz.negativeMarking && quiz.negativeWeight > 0 && wrong > 0) {
      penalty = Math.min(
        score,
        Math.round(wrong * quiz.negativeWeight * 100) / 100,
      );
      score = Math.max(0, Math.round((score - penalty) * 100) / 100);
    }
    const passed = score >= quiz.passingPercent;
    await this.prisma.lessonQuizAttempt.create({
      data: {
        quizId: quiz.id,
        studentId,
        score,
        passed,
        answers: answers as any,
      },
    });
    return {
      score,
      passed,
      total,
      correct,
      wrong,
      penalty: quiz.negativeMarking ? penalty : 0,
      results,
    };
  }

  // ============ THỐNG KÊ HOẠT ĐỘNG HỌC SINH ============

  async courseActivity(courseId: string, teacherId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: { select: { id: true, fullName: true, studentCode: true } } },
    });
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      select: { id: true, title: true },
    });
    const titleOf = new Map(lessons.map((l) => [l.id, l.title]));
    const progresses = await this.prisma.lessonProgress.findMany({
      where: { lessonId: { in: lessons.map((l) => l.id) } },
    });
    const byStudent = new Map<string, any[]>();
    for (const p of progresses) {
      if (!byStudent.has(p.studentId)) byStudent.set(p.studentId, []);
      byStudent.get(p.studentId)!.push(p);
    }
    return enrollments.map((e) => {
      const ps = byStudent.get(e.studentId) || [];
      const done = ps.filter((p) => p.completed).length;
      const totalSec = ps.reduce((s, p) => s + p.watchedSec, 0);
      const last = ps
        .map((p) => new Date(p.updatedAt).getTime())
        .sort((a, b) => b - a)[0];
      const lastP = ps.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
      return {
        student: e.student,
        progress: e.progress,
        completedLessons: done,
        totalLessons: lessons.length,
        totalSec,
        lastActive: last ? new Date(last).toISOString() : null,
        lastLessonTitle: lastP ? titleOf.get(lastP.lessonId) || null : null,
      };
    });
  }

  // ============ GHI CHÚ CÁ NHÂN TRONG BÀI GIẢNG ============

  async getLessonNote(lessonId: string, studentId: string) {
    return this.prisma.lessonNote.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
    });
  }

  async saveLessonNote(lessonId: string, studentId: string, content: string) {
    return this.prisma.lessonNote.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      update: { content },
      create: { lessonId, studentId, content },
    });
  }

  // ============ NHIỆM VỤ TUẦN (HỌC SINH) ============

  async weeklyTasks(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              include: { exam: { select: { id: true, title: true } } },
            },
          },
        },
      },
    });
    const lessonIds = enrollments.flatMap((e) => e.course.lessons.map((l) => l.id));
    const progresses = await this.prisma.lessonProgress.findMany({
      where: { lessonId: { in: lessonIds }, studentId },
      select: { lessonId: true, completed: true },
    });
    const done = new Set(progresses.filter((p) => p.completed).map((p) => p.lessonId));
    const now = Date.now();
    const week = now + 7 * 86400000;
    const upcoming: any[] = [];
    const todo: any[] = [];
    for (const e of enrollments) {
      if (!e.course.isPublished) continue;
      for (const l of e.course.lessons) {
        if (
          l.deadline &&
          new Date(l.deadline).getTime() > now &&
          new Date(l.deadline).getTime() <= week
        ) {
          upcoming.push({
            lessonId: l.id,
            title: l.title,
            courseId: e.course.id,
            courseTitle: e.course.title,
            examTitle: l.exam?.title || null,
            deadline: l.deadline,
          });
        }
        if (!done.has(l.id)) {
          todo.push({
            lessonId: l.id,
            title: l.title,
            courseId: e.course.id,
            courseTitle: e.course.title,
          });
        }
      }
    }
    return {
      upcoming: upcoming.slice(0, 8),
      todo: todo.slice(0, 8),
      totalTodo: todo.length,
    };
  }

  // ============ SỐ LIỆU TỪNG BÀI GIẢNG (GIÁO VIÊN) ============

  async lessonStats(courseId: string, teacherId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      select: { id: true },
    });
    const progresses = await this.prisma.lessonProgress.findMany({
      where: { lessonId: { in: lessons.map((l) => l.id) } },
      select: { lessonId: true, completed: true },
    });
    const map = new Map<string, { viewed: number; completed: number }>();
    for (const p of progresses) {
      const m = map.get(p.lessonId) || { viewed: 0, completed: 0 };
      m.viewed++;
      if (p.completed) m.completed++;
      map.set(p.lessonId, m);
    }
    return Object.fromEntries(map.entries());
  }

  // Chứng chỉ hoàn thành khóa học (PDF) — chỉ khi học xong 100% bài giảng
  async certificatePdf(courseId: string, studentId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacher: { select: { fullName: true } },
        lessons: { select: { id: true } },
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (!course.lessons.length) {
      throw new ForbiddenException('Khóa học chưa có bài giảng');
    }
    const done = await this.prisma.lessonProgress.count({
      where: {
        lessonId: { in: course.lessons.map((l) => l.id) },
        studentId,
        completed: true,
      },
    });
    if (done < course.lessons.length) {
      throw new ForbiddenException(
        `Bạn mới hoàn thành ${done}/${course.lessons.length} bài — hãy học hết để nhận chứng chỉ`,
      );
    }
    const student = await this.prisma.user.findUnique({ where: { id: studentId } });

    // Điểm trung bình khóa học (theo %): trung bình điểm BTVN tốt nhất từng đề,
    // nếu không có BTVN thì dùng trung bình điểm quiz củng cố
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      select: { id: true, examId: true },
    });
    const examIds = lessons.map((l) => l.examId).filter(Boolean) as string[];
    let avgPercent: number | null = null;
    if (examIds.length) {
      const exams = await this.prisma.exam.findMany({
        where: { id: { in: examIds } },
        select: { id: true, totalScore: true },
      });
      const totalOf = new Map(exams.map((e) => [e.id, e.totalScore]));
      const percents: number[] = [];
      for (const eid of examIds) {
        const best = await this.prisma.examAttempt.findFirst({
          where: { examId: eid, studentId, score: { not: null } },
          orderBy: { score: 'desc' },
        });
        const ts = totalOf.get(eid) || 10;
        if (best && best.score != null && ts > 0) {
          percents.push(Math.round((best.score / ts) * 100));
        }
      }
      if (percents.length) {
        avgPercent = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
      }
    }
    if (avgPercent === null) {
      const quizAttempts = await this.prisma.lessonQuizAttempt.findMany({
        where: {
          quiz: { lessonId: { in: lessons.map((l) => l.id) } },
          studentId,
        },
        select: { score: true },
      });
      if (quizAttempts.length) {
        avgPercent = Math.round(
          quizAttempts.reduce((a, b) => a + b.score, 0) / quizAttempts.length,
        );
      }
    }

    // Mã xác minh (chuỗi, xác định theo khóa + học sinh)
    const serial = 'LM-' +
      createHash('sha256')
        .update(`${courseId}:${studentId}:lumimath`)
        .digest('hex')
        .slice(0, 10)
        .toUpperCase();

    const tex = [
      '\\documentclass[12pt]{article}',
      '\\usepackage{vntex}',
      '\\usepackage[margin=1.5cm]{geometry}',
      '\\begin{document}',
      '\\begin{center}',
      '{\\Huge \\textbf{LUMIMATH}}\\\\[8pt]',
      '{\\Large \\textbf{GIẤY CHỨNG NHẬN}}\\\\[16pt]',
      '{\\large Chứng nhận học sinh}\\\\[8pt]',
      '{\\LARGE \\textbf{' + this.escapeLatex(student?.fullName || 'Học sinh') + '}}\\\\[8pt]',
      '{\\large đã hoàn thành khóa học}\\\\[8pt]',
      '{\\LARGE \\textbf{' + this.escapeLatex(course.title) + '}}\\\\[8pt]',
      '{\\large Giáo viên hướng dẫn: ' + this.escapeLatex(course.teacher?.fullName || '') + '}\\\\[6pt]',
      '{\\large Ngày ' + new Date().toLocaleDateString('vi-VN') + '}' +
        (avgPercent != null ? ' \\quad\\bullet\\quad {\\large Điểm trung bình: ' + avgPercent + '\\%}' : '') +
        '\\\\[20pt]',
      '\\rule{0.55\\textwidth}{0.4pt}\\\\[8pt]',
      '{\\small Mã xác minh: \\texttt{' + serial + '}}\\\\[3pt]',
      '{\\small Được cấp tự động bởi hệ thống LumiMath — app.toanthayminhtri.io.vn}',
      '\\end{center}',
      '\\end{document}',
    ].join('\n');
    const pdf = await this.compileRaw(tex);
    return {
      buffer: pdf,
      filename: `Chung-chi-${course.title.replace(/[^a-zA-Z0-9đĐ ]/g, '').trim().replace(/\s+/g, '-').slice(0, 50)}.pdf`,
      contentType: 'application/pdf',
    };
  }

  async remove(id: string, teacherId: string) {
    await this.getOwnedCourse(id, teacherId);
    return this.prisma.course.delete({ where: { id } });
  }

  // ============ BÀI GIẢNG ============

  async createLesson(courseId: string, teacherId: string, dto: CreateLessonDto) {
    await this.getOwnedCourse(courseId, teacherId);
    return this.prisma.lesson.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        chapter: (dto as any).chapter || null,
        order: dto.order ?? 0,
        youtubeUrl: dto.youtubeUrl,
        pdfLinks: dto.pdfLinks ?? [],
        videos: (dto as any).videos ?? [],
        materials: (dto as any).materials ?? [],
        content: dto.content,
        duration: dto.duration,
        examId: dto.examId ?? null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        blocks: (dto as any).blocks ?? undefined,
        isPreviewFree: (dto as any).isPreviewFree ?? false,
      },
    });
  }

  async updateLesson(
    lessonId: string,
    teacherId: string,
    dto: UpdateLessonDto,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (lesson.course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu bài giảng này');
    }
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: dto.title,
        description: dto.description,
        chapter:
          (dto as any).chapter === undefined ? undefined : (dto as any).chapter,
        order: dto.order,
        youtubeUrl: dto.youtubeUrl,
        pdfLinks: dto.pdfLinks,
        videos:
          (dto as any).videos === undefined ? undefined : (dto as any).videos,
        materials:
          (dto as any).materials === undefined
            ? undefined
            : (dto as any).materials,
        content: dto.content,
        duration: dto.duration,
        examId: dto.examId,
        deadline:
          dto.deadline === undefined
            ? undefined
            : dto.deadline
              ? new Date(dto.deadline)
              : null,
        blocks:
          (dto as any).blocks === undefined ? undefined : (dto as any).blocks,
        isPreviewFree:
          (dto as any).isPreviewFree === undefined
            ? undefined
            : (dto as any).isPreviewFree,
      },
    });
  }

  async removeLesson(lessonId: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (lesson.course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu bài giảng này');
    }
    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  // ============ ĐĂNG KÝ KHÓA HỌC ============

  async enroll(courseId: string, studentId: string, password?: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    if (course.password && course.password !== password) {
      throw new ForbiddenException('Mật khẩu khóa học không đúng');
    }

    return this.prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      update: {},
      create: { courseId, studentId },
    });
  }

  async myCourses(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, fullName: true, school: true } },
            _count: { select: { lessons: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  // ============ QUẢN LÝ HỌC SINH (GIÁO VIÊN) ============

  async listStudents(courseId: string, teacherId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentCode: true,
            className: true,
            xp: true,
            level: true,
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    return enrollments.map((e) => ({
      enrollmentId: e.id,
      enrolledAt: e.enrolledAt,
      progress: e.progress,
      student: e.student,
    }));
  }

  async removeStudent(courseId: string, teacherId: string, studentId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    await this.prisma.enrollment.deleteMany({
      where: { courseId, studentId },
    });
    return { ok: true };
  }

  // ============ BẢNG ĐIỂM KHÓA HỌC (GIÁO VIÊN) ============

  async getCourseResults(courseId: string, teacherId: string) {
    const course = await this.getOwnedCourse(courseId, teacherId);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            studentCode: true,
            className: true,
            xp: true,
            level: true,
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    // Các đề thi gắn vào bài giảng của khóa học (BTVN)
    const exams = await this.prisma.exam.findMany({
      where: { teacherId, lessons: { some: { courseId } } },
      select: { id: true, title: true, totalScore: true },
    });

    const studentIds = enrollments.map((e) => e.studentId);
    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        studentId: { in: studentIds },
        examId: { in: exams.map((x) => x.id) },
        submittedAt: { not: null },
      },
    });

    const students = enrollments.map((e) => {
      const myAttempts = attempts.filter((a) => a.studentId === e.studentId);
      const scores: Record<string, number | null> = {};
      for (const ex of exams) {
        const list = myAttempts
          .filter((a) => a.examId === ex.id && a.score !== null)
          .map((a) => a.score as number);
        scores[ex.id] = list.length ? Math.max(...list) : null;
      }
      const earned = Object.values(scores).filter((s) => s !== null) as number[];
      const maxTotal = exams
        .filter((ex) => scores[ex.id] !== null)
        .reduce((s, ex) => s + ex.totalScore, 0);
      const sum = earned.reduce((s, v) => s + v, 0);
      return {
        student: e.student,
        enrolledAt: e.enrolledAt,
        progress: e.progress,
        scores,
        sum: Math.round(sum * 100) / 100,
        maxTotal: Math.round(maxTotal * 100) / 100,
        avg:
          earned.length > 0
            ? Math.round(
                (sum / exams.filter((ex) => scores[ex.id] !== null).length) *
                  100,
              ) / 100
            : null,
      };
    });

    return { course: { id: course.id, title: course.title }, exams, students };
  }

  async exportCourseResults(courseId: string, teacherId: string, format: string) {
    const data = await this.getCourseResults(courseId, teacherId);
    const headers = ['STT', 'Họ tên', 'Mã HS', 'Lớp', ...data.exams.map((e) => e.title), 'Tổng', 'Tiến độ'];
    const rows: string[][] = data.students.map((s: any, i: number) => [
      String(i + 1),
      s.student.fullName,
      s.student.studentCode || '—',
      s.student.className || '—',
      ...data.exams.map((e: any) =>
        s.scores[e.id] === null ? '—' : String(s.scores[e.id]),
      ),
      s.maxTotal > 0 ? `${s.sum}/${s.maxTotal}` : '—',
      `${Math.round((s.progress ?? 0) * 100)}%`,
    ]);
    const baseName = safeFilename(`bang-diem-khoa-${data.course.title}`);

    if (format === 'xlsx') {
      const sheetRows = data.students.map((s: any, i: number) => {
        const row: Record<string, any> = {
          STT: i + 1,
          'Họ tên': s.student.fullName,
          'Mã HS': s.student.studentCode || '—',
          'Lớp': s.student.className || '—',
        };
        data.exams.forEach((e: any) => {
          row[e.title.slice(0, 30)] =
            s.scores[e.id] === null ? '—' : s.scores[e.id];
        });
        row['Tổng điểm'] = s.maxTotal > 0 ? `${s.sum}/${s.maxTotal}` : '—';
        row['Tiến độ'] = `${Math.round((s.progress ?? 0) * 100)}%`;
        return row;
      });
      return {
        buffer: buildXlsx('Bảng điểm khóa học', sheetRows),
        filename: `${baseName}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const tex = buildTablePdf(
      'BẢNG ĐIỂM KHÓA HỌC',
      `Khóa học: ${data.course.title} — ${data.students.length} học sinh — ${data.exams.length} bài kiểm tra`,
      headers,
      rows,
    );
    return {
      buffer: await this.compileRaw(tex),
      filename: `${baseName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  // ============ TIẾN ĐỘ HỌC TẬP ============

  async markLessonComplete(
    courseId: string,
    lessonId: string,
    studentId: string,
    completed: boolean,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');

    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');

    await this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      update: { completed },
      create: { lessonId, studentId, completed },
    });

    // Cập nhật % hoàn thành của Enrollment
    const total = await this.prisma.lesson.count({ where: { courseId } });
    const done = await this.prisma.lessonProgress.count({
      where: { lesson: { courseId }, studentId, completed: true },
    });
    const progress = total ? Math.round((done / total) * 100) / 100 : 0;
    await this.prisma.enrollment.update({
      where: { courseId_studentId: { courseId, studentId } },
      data: { progress },
    });

    return { completed, done, total, progress };
  }

  async getCourseProgress(courseId: string, studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');

    const progresses = await this.prisma.lessonProgress.findMany({
      where: { studentId, lesson: { courseId } },
    });
    const total = await this.prisma.lesson.count({ where: { courseId } });
    const done = progresses.filter((p) => p.completed).length;

    return {
      total,
      done,
      progress: total ? Math.round((done / total) * 100) / 100 : 0,
      completedLessonIds: progresses
        .filter((p) => p.completed)
        .map((p) => p.lessonId),
    };
  }

  // ============ THẢO LUẬN BÀI GIẢNG ============

  private async checkLessonAccess(
    courseId: string,
    lessonId: string,
    userId: string,
    role: Role,
  ) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (role === Role.STUDENT) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: userId } },
      });
      if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');
    } else if (lesson.course.teacherId !== userId) {
      throw new ForbiddenException('Bạn không sở hữu khóa học này');
    }
    return lesson;
  }

  async listComments(
    courseId: string,
    lessonId: string,
    userId: string,
    role: Role,
  ) {
    await this.checkLessonAccess(courseId, lessonId, userId, role);
    return this.prisma.lessonComment.findMany({
      where: { lessonId },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addComment(
    courseId: string,
    lessonId: string,
    userId: string,
    role: Role,
    content: string,
  ) {
    await this.checkLessonAccess(courseId, lessonId, userId, role);
    const text = (content || '').trim();
    if (!text) throw new ForbiddenException('Nội dung bình luận trống');
    return this.prisma.lessonComment.create({
      data: { lessonId, authorId: userId, content: text },
      include: {
        author: { select: { id: true, fullName: true, role: true } },
      },
    });
  }

  async removeComment(commentId: string, userId: string, role: Role) {
    const comment = await this.prisma.lessonComment.findUnique({
      where: { id: commentId },
      include: { lesson: { include: { course: true } } },
    });
    if (!comment) throw new NotFoundException('Không tìm thấy bình luận');
    const isOwner = comment.authorId === userId;
    const isTeacher = comment.lesson.course.teacherId === userId;
    if (!isOwner && !isTeacher) {
      throw new ForbiddenException('Không thể xóa bình luận này');
    }
    return this.prisma.lessonComment.delete({ where: { id: commentId } });
  }

  // ============ ĐÁNH GIÁ KHÓA HỌC ============

  async addReview(
    courseId: string,
    studentId: string,
    rating: number,
    comment?: string,
  ) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');
    const r = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
    return this.prisma.courseReview.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      update: { rating: r, comment },
      create: { courseId, studentId, rating: r, comment },
    });
  }

  async listReviews(courseId: string, userId: string, role: Role) {
    if (role === Role.STUDENT) {
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: userId } },
      });
      if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');
    } else {
      await this.getOwnedCourse(courseId, userId);
    }
    const [reviews, agg] = await Promise.all([
      this.prisma.courseReview.findMany({
        where: { courseId },
        include: { student: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.courseReview.aggregate({
        where: { courseId },
        _avg: { rating: true },
        _count: true,
      }),
    ]);
    return {
      avg: agg._avg.rating
        ? Math.round(agg._avg.rating * 10) / 10
        : null,
      count: agg._count,
      myRating: role === Role.STUDENT
        ? (reviews.find((r) => r.studentId === userId)?.rating ?? null)
        : null,
      reviews,
    };
  }

  // ============ HELPER ============

  private async getOwnedCourse(id: string, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu khóa học này');
    }
    return course;
  }
}
