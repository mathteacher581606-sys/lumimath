import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
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
    // Trợ giảng không được tạo khóa học
    if (await this.isAssistantOnly(teacherId)) {
      throw new ForbiddenException('Trợ giảng không được tạo khóa học');
    }
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
      const courses = await this.prisma.course.findMany({
        where: {
          OR: [
            { teacherId: user.id },
            { assistants: { some: { userId: user.id } } },
          ],
        },
        include: {
          teacher: { select: { id: true, fullName: true } },
          _count: { select: { lessons: true, enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return courses.map((c) => ({
        ...c,
        isAssistant: c.teacherId !== user.id,
      }));
    }
    const list = await this.prisma.course.findMany({
      where: { isPublished: true },
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // KHÔNG gửi mật khẩu ghi danh cho học sinh — chỉ báo khóa có mật khẩu hay không
    return list.map((c) => this.publicCourse(c));
  }

  private publicCourse<T extends { password?: string | null }>(c: T) {
    const { password, ...rest } = c as any;
    return { ...rest, hasPassword: !!password };
  }

  async findOne(id: string, user?: any) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        _count: { select: { enrollments: true, lessons: true } },
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

    // Ai đang xem: người quản lý (chủ khóa / trợ giảng / admin) thấy toàn bộ;
    // học sinh đã ghi danh thấy bài đã mở; còn lại chỉ thấy tên bài + bài xem thử.
    const manager = await this.isManager(course as any, user);
    if (manager) return { ...course, hasPassword: !!(course as any).password, enrolled: true, canManage: true };

    const c = this.publicCourse(course as any) as any;
    if (!c.isPublished) throw new NotFoundException('Không tìm thấy khóa học');
    let enrolled = false;
    if (user?.role === 'STUDENT') {
      const en = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId: id, studentId: user.id } },
      });
      enrolled = !!en;
    }

    const now = Date.now();
    const visible = (course as any).lessons.filter((l: any) => !l.hidden);
    const done = enrolled
      ? new Set(
          (
            await this.prisma.lessonProgress.findMany({
              where: { studentId: user.id, completed: true, lesson: { courseId: id } },
              select: { lessonId: true },
            })
          ).map((p) => p.lessonId),
        )
      : new Set<string>();

    let blockedBySequence = false;
    const lessons = visible.map((l: any) => {
      const scheduled = l.publishAt && new Date(l.publishAt).getTime() > now;
      let lockReason: string | null = null;
      if (scheduled) lockReason = 'scheduled';
      else if (!enrolled && !l.isPreviewFree) lockReason = 'enroll';
      // Học tuần tự: HS vẫn XEM TRƯỚC được bài sau (theo ý GV), chỉ không được
      // đánh dấu hoàn thành khi bài trước chưa xong → gắn cờ seqPending để giao diện nhắc.
      const seqPending = enrolled && !!(course as any).sequential && blockedBySequence;
      if (enrolled && !scheduled && !done.has(l.id)) blockedBySequence = true;
      const { hidden, ...rest } = l;
      if (!lockReason) return { ...rest, locked: false, lockReason: null, seqPending };
      return {
        id: l.id,
        title: l.title,
        order: l.order,
        chapter: l.chapter,
        isPreviewFree: !!l.isPreviewFree,
        publishAt: l.publishAt,
        deadline: l.deadline,
        locked: true,
        lockReason,
        exam: null,
        _count: null,
      };
    });
    return { ...c, lessons, enrolled, canManage: false };
  }

  // Chủ khóa, trợ giảng của khóa, hoặc quản trị viên
  private async isManager(course: { id: string; teacherId: string }, user?: any) {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'TEACHER') return false;
    if (course.teacherId === user.id) return true;
    const a = await this.prisma.courseAssistant.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: user.id } },
    });
    return !!a;
  }

  // Học sinh chỉ thao tác được trên bài giảng thuộc khóa đã ghi danh, không ẩn, đã tới giờ mở
  private async assertStudentLesson(courseId: string, lessonId: string, studentId: string) {
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId },
      select: { id: true, hidden: true, publishAt: true },
    });
    if (!lesson || lesson.hidden) throw new NotFoundException('Không tìm thấy bài giảng');
    const en = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!en) throw new ForbiddenException('Chưa đăng ký khóa học');
    if (lesson.publishAt && lesson.publishAt.getTime() > Date.now()) {
      throw new ForbiddenException('Bài giảng chưa đến giờ mở');
    }
    return lesson;
  }

  async update(id: string, teacherId: string, dto: UpdateCourseDto) {
    // Chỉ chủ khóa học được sửa (trợ giảng không được sửa khóa học)
    await this.requireOwner(id, teacherId);
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
    const owns = await this.prisma.lesson.count({ where: { id: lessonId, courseId } });
    if (!owns) throw new NotFoundException('Không tìm thấy bài giảng');
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
  async getLessonQuiz(courseId: string, lessonId: string, teacherId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    const owns = await this.prisma.lesson.count({ where: { id: lessonId, courseId } });
    if (!owns) throw new NotFoundException('Không tìm thấy bài giảng');
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
    await this.assertStudentLesson(courseId, lessonId, studentId);
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
      // Phiếu ký số: máy chủ chỉ chấm đúng bộ câu đã phát cho học sinh này
      token: this.signQuiz(quiz.id, studentId, picked.map((q: any) => q.id)),
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
    await this.assertStudentLesson(courseId, lessonId, studentId);
    const quiz = await this.prisma.lessonQuiz.findUnique({ where: { lessonId } });
    if (!quiz) throw new NotFoundException('Bài giảng không có quiz');
    // Chỉ chấm đúng bộ câu đã phát (chống gửi mã câu bất kỳ để dò đáp án / chọn câu dễ)
    const servedIds = this.verifyQuiz(String(body?.token || ''), quiz.id, studentId);
    if (!servedIds) {
      throw new BadRequestException('Phiên làm quiz không hợp lệ hoặc đã hết hạn — hãy tải lại bài.');
    }
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
    const raw = body?.answers && typeof body.answers === 'object' ? body.answers : {};
    const answers: Record<string, string> = {};
    for (const id of servedIds) if (typeof raw[id] === 'string') answers[id] = raw[id];
    const inExam = await this.prisma.examItem.findMany({
      where: { examId: quiz.examId, questionId: { in: servedIds } },
      select: { questionId: true },
    });
    const ids = inExam.map((i) => i.questionId);
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

  private quizSecret() {
    return (process.env.JWT_ACCESS_SECRET || 'lumimath-access-secret-change-this-in-production') + ':lesson-quiz';
  }

  // token = base64url(json{q,s,ids,exp}).hmac — hạn 6 giờ
  private signQuiz(quizId: string, studentId: string, ids: string[]) {
    const body = Buffer.from(
      JSON.stringify({ q: quizId, s: studentId, ids, exp: Date.now() + 6 * 3600_000 }),
    ).toString('base64url');
    const mac = createHmac('sha256', this.quizSecret()).update(body).digest('base64url');
    return `${body}.${mac}`;
  }

  private verifyQuiz(token: string, quizId: string, studentId: string): string[] | null {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const want = createHmac('sha256', this.quizSecret()).update(body).digest();
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    try {
      const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (d.q !== quizId || d.s !== studentId || !(d.exp > Date.now())) return null;
      return Array.isArray(d.ids) ? d.ids.map(String).slice(0, 50) : null;
    } catch {
      return null;
    }
  }

  // ============ THỐNG KÊ HOẠT ĐỘNG HỌC SINH ============

  async courseActivity(courseId: string, teacherId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      include: { student: { select: { id: true, fullName: true, studentCode: true } } },
    });
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, hidden: false },
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

  async getLessonNote(courseId: string, lessonId: string, studentId: string) {
    await this.assertStudentLesson(courseId, lessonId, studentId);
    return this.prisma.lessonNote.findUnique({
      where: { lessonId_studentId: { lessonId, studentId } },
    });
  }

  async saveLessonNote(courseId: string, lessonId: string, studentId: string, content: string) {
    await this.assertStudentLesson(courseId, lessonId, studentId);
    if (content.length > 20000) throw new BadRequestException('Ghi chú tối đa 20.000 ký tự');
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
              where: {
                hidden: false,
                OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
              },
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
        lessons: { where: { hidden: false }, select: { id: true } },
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    const en = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!en) throw new ForbiddenException('Chưa đăng ký khóa học');
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
    await this.requireOwner(id, teacherId);
    return this.prisma.course.delete({ where: { id } });
  }

  // ============ BÀI GIẢNG ============

  async createLesson(courseId: string, teacherId: string, dto: CreateLessonDto) {
    await this.getOwnedCourse(courseId, teacherId);
    await this.assertLessonExam(dto.examId, courseId, teacherId);
    const chapter = ((dto as any).chapter || null) as string | null;

    // Tự chèn bài mới vào CUỐI CHƯƠNG của nó (giữ các chương liền mạch)
    let order = dto.order;
    if (order === undefined || order === null) {
      const lessons = await this.prisma.lesson.findMany({
        where: { courseId },
        select: { id: true, chapter: true, order: true },
        orderBy: { order: 'asc' },
      });
      const chapterLessons = lessons.filter((l) => (l.chapter || null) === chapter);
      if (chapterLessons.length) {
        const insertAt = (chapterLessons[chapterLessons.length - 1].order ?? 0) + 1;
        // Dồn các bài phía sau xuống 1 bậc
        const shift = lessons.filter((l) => (l.order ?? 0) >= insertAt);
        if (shift.length) {
          await this.prisma.$transaction(
            shift.map((l) =>
              this.prisma.lesson.update({
                where: { id: l.id },
                data: { order: (l.order ?? 0) + 1 },
              }),
            ),
          );
        }
        order = insertAt;
      } else {
        order = (lessons.length ? Math.max(...lessons.map((l) => l.order ?? 0)) : 0) + 1;
      }
    }

    return this.prisma.lesson.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        chapter,
        order,
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
        hidden: !!(dto as any).hidden,
        publishAt: this.parseOptDate((dto as any).publishAt) ?? null,
      },
    });
  }

  // '' | null → null; chuỗi ngày hợp lệ → Date; undefined → undefined (không đổi)
  private parseOptDate(v: any): Date | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Thời điểm mở bài không hợp lệ');
    return d;
  }

  // Đề gắn vào bài giảng phải là đề của chính giáo viên (hoặc chủ khóa)
  private async assertLessonExam(examId: any, courseId: string, userId: string) {
    if (!examId) return;
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
    const ok = await this.prisma.exam.count({
      where: { id: String(examId), teacherId: { in: [userId, course?.teacherId || userId] } },
    });
    if (!ok) throw new BadRequestException('Đề thi không tồn tại hoặc không thuộc về bạn');
  }

  async updateLesson(
    lessonId: string,
    teacherId: string,
    dto: UpdateLessonDto,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    // Chủ khóa học hoặc trợ giảng đều được sửa bài giảng
    await this.getOwnedCourse(lesson.courseId, teacherId);
    await this.assertLessonExam(dto.examId, lesson.courseId, teacherId);
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
        hidden: (dto as any).hidden === undefined ? undefined : !!(dto as any).hidden,
        publishAt: this.parseOptDate((dto as any).publishAt),
      },
    });
  }

  async removeLesson(lessonId: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    // Chủ khóa học hoặc trợ giảng đều được xóa bài giảng
    await this.getOwnedCourse(lesson.courseId, teacherId);
    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  // ===== CHƯƠNG: đổi tên + sắp xếp lại thứ tự =====
  async renameChapter(
    courseId: string,
    userId: string,
    oldTitle: string,
    newTitle: string,
  ) {
    await this.getOwnedCourse(courseId, userId);
    const from = String(oldTitle || '');
    const to = String(newTitle || '').trim();
    if (!to) throw new BadRequestException('Tên chương không được để trống');
    if (from === to) return { ok: true, updated: 0 };
    const res = await this.prisma.lesson.updateMany({
      where: { courseId, chapter: from },
      data: { chapter: to },
    });
    return { ok: true, updated: res.count };
  }

  async reorderChapters(courseId: string, userId: string, order: string[]) {
    await this.getOwnedCourse(courseId, userId);
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId },
      select: { id: true, chapter: true, order: true },
    });
    const groups = new Map<string, any[]>();
    for (const l of lessons) {
      const k = l.chapter || '';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(l);
    }
    for (const arr of groups.values()) {
      arr.sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
      );
    }
    // Thứ tự chương mong muốn; chương không có trong danh sách thì xếp cuối
    const seq: string[] = [];
    for (const t of order || []) {
      if (groups.has(t) && !seq.includes(t)) seq.push(t);
    }
    for (const t of groups.keys()) {
      if (!seq.includes(t)) seq.push(t);
    }
    // Đánh lại order tuần tự: chương 1 (1..n), chương 2 (n+1..), ...
    let n = 1;
    for (const t of seq) {
      for (const l of groups.get(t) || []) {
        await this.prisma.lesson.update({
          where: { id: l.id },
          data: { order: n++ },
        });
      }
    }
    return { ok: true, chapters: seq.length, lessons: lessons.length };
  }

  // Sao chép bài giảng từ khóa học A sang khóa học B (giáo viên sở hữu cả 2)
  async copyLessons(
    targetCourseId: string,
    teacherId: string,
    sourceCourseId: string,
    lessonIds: string[],
  ) {
    const target = await this.getOwnedCourse(targetCourseId, teacherId);
    const source = await this.getOwnedCourse(sourceCourseId, teacherId);
    if (!target || !source) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }
    if (sourceCourseId === targetCourseId) {
      throw new ForbiddenException('Không thể sao chép vào chính khóa học đó');
    }

    const where: any = { courseId: sourceCourseId };
    if (Array.isArray(lessonIds) && lessonIds.length) {
      where.id = { in: lessonIds };
    }
    const lessons = await this.prisma.lesson.findMany({
      where,
      orderBy: { order: 'asc' },
    });
    if (!lessons.length) {
      throw new NotFoundException('Không có bài giảng nào để sao chép');
    }

    const maxOrder = await this.prisma.lesson.aggregate({
      where: { courseId: targetCourseId },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max?.order ?? -1) + 1;

    const created = await this.prisma.$transaction(
      lessons.map((l) =>
        this.prisma.lesson.create({
          data: {
            courseId: targetCourseId,
            title: l.title,
            description: l.description,
            chapter: l.chapter,
            order: nextOrder++,
            youtubeUrl: l.youtubeUrl,
            pdfLinks: l.pdfLinks,
            videos: l.videos,
            materials: l.materials,
            content: l.content,
            duration: l.duration,
            examId: l.examId,
            deadline: l.deadline,
            isPreviewFree: l.isPreviewFree,
            blocks: l.blocks,
          },
        }),
      ),
    );

    return { copied: created.length, lessons: created.map((c) => ({ id: c.id, title: c.title })) };
  }

  // ============ ĐĂNG KÝ KHÓA HỌC ============

  async enroll(courseId: string, studentId: string, password?: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course || !course.isPublished) throw new NotFoundException('Không tìm thấy khóa học');

    if (course.password && course.password !== String(password ?? '')) {
      throw new ForbiddenException('Mật khẩu khóa học không đúng');
    }

    return this.prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      update: {},
      create: { courseId, studentId },
    });
  }

  async myCourses(studentId: string) {
    const rows = await this.prisma.enrollment.findMany({
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
    return rows.map((r) => ({ ...r, course: this.publicCourse(r.course) }));
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

  // Giáo viên sửa thông tin tài khoản của học sinh đã đăng ký khóa học
  async updateStudent(
    courseId: string,
    teacherId: string,
    studentId: string,
    dto: {
      fullName?: string;
      email?: string;
      className?: string;
      grade?: number | null;
    },
  ) {
    await this.getOwnedCourse(courseId, teacherId);
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment) {
      throw new NotFoundException('Học sinh chưa đăng ký khóa học này');
    }

    const data: any = {};
    if (typeof dto.fullName === 'string' && dto.fullName.trim()) {
      data.fullName = dto.fullName.trim();
    }
    if (typeof dto.className === 'string') data.className = dto.className;
    if (dto.grade !== undefined) {
      const g = Number(dto.grade);
      data.grade = g >= 1 && g <= 12 ? Math.round(g) : null;
    }
    if (typeof dto.email === 'string' && dto.email.trim()) {
      const email = dto.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ForbiddenException('Email không hợp lệ');
      }
      const dup = await this.prisma.user.findFirst({
        where: { email, id: { not: studentId } },
      });
      if (dup) {
        throw new ForbiddenException('Email đã được sử dụng bởi tài khoản khác');
      }
      data.email = email;
    }

    return this.prisma.user.update({
      where: { id: studentId },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        className: true,
        grade: true,
      },
    });
  }

  // ============ NHẬP HỌC SINH VÀO KHÓA HỌC TỪ EXCEL (GIÁO VIÊN) ============

  private randomStudentCode(): string {
    return `HS-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private randomPassword(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  private normalizeHeader(h: string): string {
    return String(h || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '');
  }

  // Buffer file mẫu nhập học sinh (xlsx)
  importStudentsTemplateBuffer(): Buffer {
    const sample = [
      {
        'Họ tên': 'Nguyễn Văn A',
        Email: 'nguyenvana@example.com',
        'Lớp': '12T4',
        'Mật khẩu': 'Abc12345',
        'Trường': '',
      },
      {
        'Họ tên': 'Trần Thị B',
        Email: 'tranthib@example.com',
        'Lớp': '12T4',
        'Mật khẩu': '',
        'Trường': '',
      },
      {
        'Họ tên': 'Lê Văn C',
        Email: 'levanc@example.com',
        'Lớp': '12T5',
        'Mật khẩu': '',
        'Trường': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // Đọc file Excel → tạo tài khoản học sinh (nếu chưa có) và thêm vào khóa học
  async importStudents(courseId: string, teacherId: string, buffer: Buffer) {
    await this.getOwnedCourse(courseId, teacherId);
    if (!buffer || !buffer.length) {
      throw new ForbiddenException('Không có file Excel');
    }

    let rows: Record<string, any>[];
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch {
      throw new ForbiddenException('Không đọc được file. Hãy dùng file .xlsx');
    }
    if (!rows.length) {
      throw new ForbiddenException('File không có dòng dữ liệu nào');
    }

    // Nhận diện cột theo tiêu đề (không dấu, không phân biệt hoa thường)
    const colMap: Record<string, string> = {};
    const aliases: Record<string, string[]> = {
      name: ['hoten', 'hovaten', 'ten', 'name', 'fullname', 'hosinh'],
      email: ['email', 'mail'],
      className: ['lop', 'class', 'classname'],
      password: ['matkhau', 'password', 'mk'],
      school: ['truong', 'school'],
    };
    for (const key of Object.keys(rows[0])) {
      const norm = this.normalizeHeader(key);
      for (const [field, names] of Object.entries(aliases)) {
        if (names.includes(norm)) colMap[field] = key;
      }
    }
    if (!colMap.name || !colMap.email) {
      throw new ForbiddenException(
        'File cần có cột "Họ tên" và "Email" (hỗ trợ thêm cột "Lớp", "Mật khẩu", "Trường")',
      );
    }

    const enrolled: string[] = [];
    const created: { fullName: string; email: string; password: string }[] = [];
    const already: string[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 2;
      const fullName = String(r[colMap.name] || '').trim();
      const email = String(r[colMap.email] || '').trim().toLowerCase();
      const className = colMap.className
        ? String(r[colMap.className] || '').trim()
        : '';
      const school = colMap.school
        ? String(r[colMap.school] || '').trim()
        : '';

      if (!fullName || !email) {
        skipped.push({ row: rowNo, reason: 'Thiếu họ tên hoặc email' });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped.push({ row: rowNo, reason: `Email không hợp lệ: ${email}` });
        continue;
      }

      let user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        let password = this.randomPassword();
        if (colMap.password) {
          const given = String(r[colMap.password] || '').trim();
          if (given) {
            if (given.length < 6) {
              skipped.push({
                row: rowNo,
                reason: `Mật khẩu phải ≥ 6 ký tự (${fullName})`,
              });
              continue;
            }
            password = given;
          }
        }
        const hash = await bcrypt.hash(password, 10);
        user = await this.prisma.user.create({
          data: {
            email,
            passwordHash: hash,
            role: Role.STUDENT,
            fullName,
            className: className || null,
            school: school || null,
            studentCode: this.randomStudentCode(),
          },
        });
        created.push({ fullName, email, password });
      } else if (user.role !== Role.STUDENT) {
        skipped.push({ row: rowNo, reason: `Email thuộc tài khoản không phải học sinh: ${email}` });
        continue;
      } else if (className && !user.className) {
        // bổ sung lớp nếu tài khoản có sẵn nhưng chưa có lớp
        await this.prisma.user.update({
          where: { id: user.id },
          data: { className },
        });
      }

      const existing = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: user.id } },
      });
      if (existing) {
        already.push(email);
        continue;
      }
      await this.prisma.enrollment.create({
        data: { courseId, studentId: user.id },
      });
      enrolled.push(email);
    }

    return { enrolled: enrolled.length, created, already, skipped, total: rows.length };
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

    await this.assertStudentLesson(courseId, lessonId, studentId);
    if (completed) await this.assertSequentialOpen(courseId, lessonId, studentId);

    await this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      update: { completed },
      create: { lessonId, studentId, completed },
    });

    // Cập nhật % hoàn thành của Enrollment (không tính bài nháp)
    const total = await this.prisma.lesson.count({ where: { courseId, hidden: false } });
    const done = await this.prisma.lessonProgress.count({
      where: { lesson: { courseId, hidden: false }, studentId, completed: true },
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
      where: { studentId, lesson: { courseId, hidden: false } },
      orderBy: { updatedAt: 'desc' },
    });
    const total = await this.prisma.lesson.count({ where: { courseId, hidden: false } });
    const done = progresses.filter((p) => p.completed).length;

    return {
      total,
      done,
      progress: total ? Math.round((done / total) * 100) / 100 : 0,
      completedLessonIds: progresses
        .filter((p) => p.completed)
        .map((p) => p.lessonId),
      viewedLessonIds: progresses.map((p) => p.lessonId),
      // Bài mở gần nhất → nút "Học tiếp"
      lastLessonId: progresses[0]?.lessonId ?? null,
    };
  }

  // Học tuần tự: mọi bài (đã mở, không ẩn) đứng trước phải hoàn thành rồi
  private async assertSequentialOpen(courseId: string, lessonId: string, studentId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { sequential: true },
    });
    if (!course?.sequential) return;
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, hidden: false },
      orderBy: { order: 'asc' },
      select: { id: true, publishAt: true },
    });
    const done = new Set(
      (
        await this.prisma.lessonProgress.findMany({
          where: { studentId, completed: true, lesson: { courseId } },
          select: { lessonId: true },
        })
      ).map((p) => p.lessonId),
    );
    const now = Date.now();
    for (const l of lessons) {
      if (l.id === lessonId) return;
      if (l.publishAt && l.publishAt.getTime() > now) continue;
      if (!done.has(l.id)) {
        throw new ForbiddenException('Khóa học tuần tự: hãy hoàn thành bài trước đã');
      }
    }
  }

  // Ghi nhận học sinh MỞ bài (tạo dòng tiến độ chưa hoàn thành) → GV thấy "đã xem / chưa xem"
  async markLessonViewed(courseId: string, lessonId: string, studentId: string) {
    await this.assertStudentLesson(courseId, lessonId, studentId);
    await this.prisma.lessonProgress.upsert({
      where: { lessonId_studentId: { lessonId, studentId } },
      // tăng 0 để cập nhật updatedAt → "Học tiếp" mở đúng bài xem gần nhất
      update: { watchedSec: { increment: 0 } },
      create: { lessonId, studentId, completed: false },
    });
    return { ok: true };
  }

  // GV: ai đã xem / hoàn thành / chưa xem một bài giảng
  async lessonViewers(courseId: string, lessonId: string, teacherId: string) {
    await this.getOwnedCourse(courseId, teacherId);
    const owns = await this.prisma.lesson.count({ where: { id: lessonId, courseId } });
    if (!owns) throw new NotFoundException('Không tìm thấy bài giảng');
    const [enrollments, progresses] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { courseId },
        include: {
          student: { select: { id: true, fullName: true, studentCode: true, className: true } },
        },
      }),
      this.prisma.lessonProgress.findMany({ where: { lessonId } }),
    ]);
    const byStudent = new Map(progresses.map((p) => [p.studentId, p]));
    const rows = enrollments.map((e: any) => {
      const p = byStudent.get(e.studentId);
      return {
        student: e.student,
        status: !p ? 'NOT_VIEWED' : p.completed ? 'COMPLETED' : 'VIEWED',
        at: p?.updatedAt ?? null,
      };
    });
    const order = { NOT_VIEWED: 0, VIEWED: 1, COMPLETED: 2 } as any;
    rows.sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        String(a.student?.fullName || '').localeCompare(String(b.student?.fullName || ''), 'vi'),
    );
    return {
      total: rows.length,
      notViewed: rows.filter((r) => r.status === 'NOT_VIEWED').length,
      viewed: rows.filter((r) => r.status !== 'NOT_VIEWED').length,
      completed: rows.filter((r) => r.status === 'COMPLETED').length,
      rows,
    };
  }

  // GV: gửi thông báo nhắc những học sinh CHƯA mở bài (giới hạn 1 lần / 30 phút / bài)
  private remindAt = new Map<string, number>();
  async remindLessonNotViewed(courseId: string, lessonId: string, teacherId: string) {
    const v = await this.lessonViewers(courseId, lessonId, teacherId);
    const last = this.remindAt.get(lessonId) || 0;
    if (Date.now() - last < 30 * 60_000) {
      throw new HttpException('Vừa nhắc bài này rồi — thử lại sau 30 phút', 429);
    }
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { title: true, course: { select: { title: true } } },
    });
    const targets = v.rows.filter((r) => r.status === 'NOT_VIEWED').map((r) => r.student.id);
    if (targets.length) {
      await this.prisma.notification.createMany({
        data: targets.map((userId) => ({
          userId,
          title: 'Nhắc học bài',
          body: `Em chưa mở bài "${lesson?.title}" trong khóa ${lesson?.course?.title}.`,
          link: `/student/courses/${courseId}?lesson=${lessonId}`,
        })),
      });
    }
    this.remindAt.set(lessonId, Date.now());
    return { sent: targets.length };
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
      await this.assertStudentLesson(courseId, lessonId, userId);
    } else if (!(await this.isManager(lesson.course, { id: userId, role }))) {
      throw new ForbiddenException('Bạn không quản lý khóa học này');
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
    if (!text) throw new BadRequestException('Nội dung bình luận trống');
    if (text.length > 2000) throw new BadRequestException('Bình luận tối đa 2.000 ký tự');
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
    const isTeacher = await this.isManager(comment.lesson.course, { id: userId, role });
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

  // Trợ giảng thuần: có mặt trong CourseAssistant nhưng chưa sở hữu khóa học nào
  private async isAssistantOnly(userId: string): Promise<boolean> {
    const owned = await this.prisma.course.count({ where: { teacherId: userId } });
    if (owned > 0) return false;
    const assisted = await this.prisma.courseAssistant.count({
      where: { userId },
    });
    return assisted > 0;
  }

  // Chủ khóa học HOẶC trợ giảng đều có quyền quản lý (trừ thao tác chỉ dành cho chủ)
  private async getOwnedCourse(id: string, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId === teacherId) return course;
    const assistant = await this.prisma.courseAssistant.findUnique({
      where: { courseId_userId: { courseId: id, userId: teacherId } },
    });
    if (assistant) return course;
    throw new ForbiddenException('Bạn không có quyền quản lý khóa học này');
  }

  // CHỈ chủ khóa học (dùng cho xóa khóa + quản lý trợ giảng)
  private async requireOwner(id: string, userId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId !== userId) {
      throw new ForbiddenException('Chỉ chủ khóa học mới được thực hiện thao tác này');
    }
    return course;
  }

  // ============ TRỢ GIẢNG ============

  async listAssistants(courseId: string, userId: string) {
    await this.requireOwner(courseId, userId);
    const list = await this.prisma.courseAssistant.findMany({
      where: { courseId },
      include: {
        user: { select: { id: true, fullName: true, email: true, teacherCode: true } },
      },
      orderBy: { addedAt: 'asc' },
    });
    return list.map((a) => ({ id: a.id, addedAt: a.addedAt, user: a.user }));
  }

  async addAssistant(courseId: string, userId: string, email: string) {
    await this.requireOwner(courseId, userId);
    const target = await this.prisma.user.findUnique({
      where: { email: String(email || '').trim().toLowerCase() },
    });
    if (!target) throw new NotFoundException('Không tìm thấy tài khoản với email này');
    if (target.role !== Role.TEACHER) {
      throw new ForbiddenException('Tài khoản phải là giáo viên mới làm trợ giảng được');
    }
    if (target.id === userId) {
      throw new ForbiddenException('Bạn đã là chủ khóa học');
    }
    const existing = await this.prisma.courseAssistant.findUnique({
      where: { courseId_userId: { courseId, userId: target.id } },
    });
    if (existing) throw new ForbiddenException('Người này đã là trợ giảng của khóa học');
    await this.prisma.courseAssistant.create({
      data: { courseId, userId: target.id },
    });
    return { ok: true, fullName: target.fullName, email: target.email };
  }

  async removeAssistant(courseId: string, userId: string, assistantId: string) {
    await this.requireOwner(courseId, userId);
    await this.prisma.courseAssistant.deleteMany({
      where: { id: assistantId, courseId },
    });
    return { ok: true };
  }
}
