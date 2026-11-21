import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';
import { GamificationService } from '../gamification/gamification.service';
import { ExamsService } from '../exams/exams.service';
import { escapeTex, safeFilename } from '../common/export.helper';
import * as XLSX from 'xlsx';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private mail: MailService,
    private gamification: GamificationService,
    private exams: ExamsService,
  ) {}

  // Chủ khóa học hoặc trợ giảng → được xem/ quản lý như giáo viên
  private async isCourseManager(courseId: string, userId: string): Promise<boolean> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) return false;
    if (course.teacherId === userId) return true;
    const assistant = await this.prisma.courseAssistant.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });
    return !!assistant;
  }

  private async ensureTeacher(courseId: string, teacherId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId === teacherId) return course;
    // Trợ giảng cũng được quản lý bài tập của khóa học
    const assistant = await this.prisma.courseAssistant.findUnique({
      where: { courseId_userId: { courseId, userId: teacherId } },
    });
    if (assistant) return course;
    throw new ForbiddenException('Bạn không có quyền quản lý khóa học này');
  }

  // Bài giao (và bài nộp, nếu có) phải thuộc đúng khóa học trong URL — chặn sửa/chấm chéo khóa
  private async assertScope(courseId: string, assignmentId: string, submissionId?: string) {
    const a = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { courseId: true },
    });
    if (!a || a.courseId !== courseId) throw new NotFoundException('Không tìm thấy bài giao');
    if (submissionId) {
      const sub = await this.prisma.assignmentSubmission.findUnique({
        where: { id: submissionId },
        select: { assignmentId: true },
      });
      if (!sub || sub.assignmentId !== assignmentId) throw new NotFoundException('Không tìm thấy bài nộp');
    }
  }

  // Đề thi / câu ngân hàng / bài giảng gắn vào bài giao phải thuộc GV (hoặc chủ khóa) và đúng khóa
  private async assertRefs(courseId: string, userId: string, body: any) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { teacherId: true },
    });
    const owners = Array.from(new Set([userId, course?.teacherId].filter(Boolean))) as string[];
    if (body?.examId) {
      const ok = await this.prisma.exam.count({
        where: { id: String(body.examId), teacherId: { in: owners } },
      });
      if (!ok) throw new BadRequestException('Đề thi không tồn tại hoặc không thuộc về bạn');
    }
    if (Array.isArray(body?.questionIds) && body.questionIds.length) {
      const ids = body.questionIds.map(String);
      const n = await this.prisma.question.count({
        where: { id: { in: ids }, bank: { teacherId: { in: owners } } },
      });
      if (n !== new Set(ids).size) {
        throw new BadRequestException('Có câu hỏi không thuộc ngân hàng của bạn');
      }
    }
    if (body?.lessonId) {
      const ok = await this.prisma.lesson.count({
        where: { id: String(body.lessonId), courseId },
      });
      if (!ok) throw new BadRequestException('Bài giảng không thuộc khóa học này');
    }
  }

  // Hạn nộp hiệu dụng cho 1 học sinh: ưu tiên hạn riêng theo lớp, nếu không có thì dùng hạn chung
  private effectiveDueDate(assignment: any, className?: string | null): Date | null {
    const overrides = Array.isArray(assignment?.classDeadlines)
      ? (assignment.classDeadlines as any[])
      : [];
    const key = String(className ?? '').trim().toLowerCase();
    if (key) {
      // So khớp lớp không phân biệt hoa thường / khoảng trắng thừa
      const o = overrides.find(
        (d) => String(d?.className ?? '').trim().toLowerCase() === key,
      );
      if (o?.dueDate) return new Date(o.dueDate);
    }
    return assignment?.dueDate ? new Date(assignment.dueDate) : null;
  }

  // Đồng bộ điểm bài giao theo điểm bài thi hiện tại (chỉ khi lệch) — để danh sách khớp phần chi tiết.
  // Trả về mảng submissions đã cập nhật (mutate tại chỗ) để dùng cho danh sách/export.
  private async syncSubmissionScores(subs: any[]): Promise<void> {
    const withAttempt = (subs || []).filter((s) => (s?.answers as any)?.attemptId);
    if (!withAttempt.length) return;
    const attemptIds = withAttempt.map((s) => (s.answers as any).attemptId);
    const attempts = await this.prisma.examAttempt.findMany({
      where: { id: { in: attemptIds } },
      select: { id: true, score: true },
    });
    const scoreById = new Map(attempts.map((a) => [a.id, a.score]));
    for (const s of withAttempt) {
      const aid = (s.answers as any).attemptId;
      const sc = scoreById.get(aid);
      if (sc == null || typeof sc !== 'number') continue;
      // Điểm lệch → cập nhật cả điểm cuối lẫn điểm hệ thống theo bài thi
      if (s.score === sc && s.aiScore === sc) continue;
      await this.prisma.assignmentSubmission.update({
        where: { id: s.id },
        data: { score: sc, aiScore: sc, aiComment: null },
      });
      s.score = sc;
      s.aiScore = sc;
      s.aiComment = null;
    }
  }

  // ============ DANH SÁCH ============

  async list(courseId: string, userId: string, role: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    const assignments = await this.prisma.assignment.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { submissions: true } },
        exam: { select: { id: true, title: true, totalScore: true, duration: true } },
      },
    });

    if (await this.isCourseManager(courseId, userId)) {
      const studentCount = await this.prisma.enrollment.count({
        where: { courseId },
      });
      return {
        isTeacher: true,
        studentCount,
        assignments: assignments.map((a) => ({
          ...a,
          submissionCount: a._count.submissions,
        })),
      };
    }

    // Học sinh: kèm bài nộp của mình + quy tắc hiện đáp án
    const mine = await this.prisma.assignmentSubmission.findMany({
      where: {
        assignmentId: { in: assignments.map((a) => a.id) },
        studentId: userId,
      },
    });
    const byAssignment = new Map(mine.map((m) => [m.assignmentId, m]));
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { className: true },
    });
    const myClass = me?.className || null;
    return {
      isTeacher: false,
      assignments: assignments.map((a) => {
        const my = byAssignment.get(a.id) || null;
        const showAnswers = this.showAnswersRule(a as any, my);
        // Post policy: HS chỉ thấy điểm/nhận xét khi đã công bố (thủ công hoặc hẹn giờ)
        const posted =
          !a.postManually ||
          a.gradesPosted ||
          (a.postAt && new Date(a.postAt).getTime() <= Date.now());
        const visible = !!my?.published && posted;
        const due = this.effectiveDueDate(a as any, myClass);
        return {
          ...a,
          dueDate: due, // hạn nộp hiệu dụng cho lớp của học sinh này
          gradesPosted: posted,
          mySubmission: my
            ? {
                id: my.id,
                status: my.status,
                submittedAt: my.submittedAt,
                score: visible ? my.score : null,
                aiScore: visible ? my.aiScore : null,
                teacherComment: visible ? my.teacherComment : null,
                assessment: visible ? my.assessment : null,
                published: visible,
                content: my.content,
                imageUrls: my.imageUrls,
                pdfUrl: my.pdfUrl,
                // Nét chấm của GV (chỉ khi đã công bố) — để HS xem và tải bài đã chấm
                marks:
                  visible && (my as any).annotations
                    ? {
                        boardSnapshots: (my as any).annotations.boardSnapshots || {},
                        pdfBoard: (my as any).annotations.pdfBoard || {},
                      }
                    : null,
              }
            : null,
          showAnswers,
          isLate: due && my ? new Date(my.submittedAt) > due : false,
        };
      }),
    };
  }

  private showAnswersRule(a: any, my: any): boolean {
    if (!a) return false;
    if (a.hideAnswers) return false;
    if (a.revealAnswersAt && new Date(a.revealAnswersAt).getTime() > Date.now())
      return false;
    if (a.minScoreForAnswers != null) {
      const s = my?.published ? my.score : null;
      if (s == null || s < a.minScoreForAnswers) return false;
    }
    return true;
  }

  // ============ GV TẠO / SỬA / XÓA ============

  async create(courseId: string, teacherId: string, body: any) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertRefs(courseId, teacherId, body);
    const assignment = await this.prisma.assignment.create({
      data: {
        courseId,
        teacherId,
        lessonId: body?.lessonId ? String(body.lessonId) : null,
        title: String(body?.title || '').trim(),
        description: body?.description || null,
        kind: String(body?.kind || 'CUSTOM'),
        examId: body?.examId || null,
        questionIds: Array.isArray(body?.questionIds) ? body.questionIds : [],
        customContent: body?.customContent || null,
        customQuestions: Array.isArray(body?.customQuestions)
          ? body.customQuestions
          : [],
        pdfUrl: body?.pdfUrl || null,
        assignDate: body?.assignDate ? new Date(body.assignDate) : null,
        dueDate: body?.dueDate ? new Date(body.dueDate) : null,
        classDeadlines: Array.isArray(body?.classDeadlines)
          ? body.classDeadlines
              .filter((d: any) => d?.className && d?.dueDate)
              .map((d: any) => ({
                className: String(d.className).trim(),
                dueDate: new Date(d.dueDate).toISOString(),
              }))
          : [],
        minScoreForAnswers:
          body?.minScoreForAnswers != null && body.minScoreForAnswers !== ''
            ? Number(body.minScoreForAnswers)
            : null,
        hideAnswers: !!body?.hideAnswers,
        revealAnswersAt: body?.revealAnswersAt
          ? new Date(body.revealAnswersAt)
          : null,
        showLeaderboard: !!body?.showLeaderboard,
        allowResubmit: !!body?.allowResubmit,
        maxResubmit:
          body?.maxResubmit != null && body.maxResubmit !== ''
            ? Math.max(0, Number(body.maxResubmit))
            : null,
        lockAfterGraded:
          body?.lockAfterGraded === undefined ? true : !!body.lockAfterGraded,
        maxAttempts:
          body?.maxAttempts != null && body.maxAttempts !== ''
            ? Number(body.maxAttempts)
            : 0,
        lateDeductionPercent: body?.lateDeductionPercent != null && body.lateDeductionPercent !== '' ? Number(body.lateDeductionPercent) : null,
        lateIntervalHours: Number(body?.lateIntervalHours) || 24,
        lateMinPercent: body?.lateMinPercent != null && body.lateMinPercent !== '' ? Number(body.lateMinPercent) : null,
        missingDeductionPercent: body?.missingDeductionPercent != null && body.missingDeductionPercent !== '' ? Number(body.missingDeductionPercent) : null,
        postManually: !!body?.postManually,
      },
    });
    if (!assignment.title) {
      await this.prisma.assignment.delete({ where: { id: assignment.id } });
      throw new ForbiddenException('Tiêu đề bài giao không được trống');
    }
    // Đồng bộ số lần nộp tối đa sang đề thi (để giới hạn lần vào thi của học sinh)
    if (assignment.examId && (assignment.maxAttempts ?? 0) > 0) {
      await this.prisma.exam.update({
        where: { id: assignment.examId },
        data: { maxAttempts: assignment.maxAttempts },
      });
    }
    // Thông báo in-app cho học sinh đã đăng ký
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      select: { studentId: true },
    });
    await this.prisma.notification.createMany({
      data: enrollments.map((e) => ({
        userId: e.studentId,
        title: '📚 Bài tập mới được giao',
        body: `${assignment.title}${assignment.dueDate ? ` — hạn nộp ${new Date(assignment.dueDate).toLocaleString('vi-VN')}` : ''}`,
        link: `/student/courses/${courseId}?tab=assignments`,
      })),
    });
    return assignment;
  }

  async update(
    courseId: string,
    assignmentId: string,
    teacherId: string,
    body: any,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId);
    await this.assertRefs(courseId, teacherId, body);
    const data: any = {};
    if (body.lessonId !== undefined) data.lessonId = body.lessonId ? String(body.lessonId) : null;
    for (const k of [
      'title',
      'description',
      'kind',
      'examId',
      'questionIds',
      'customContent',
      'customQuestions',
      'pdfUrl',
      'hideAnswers',
      'showLeaderboard',
      'allowResubmit',
      'lockAfterGraded',
      'maxAttempts',
      'lateDeductionPercent',
      'lateIntervalHours',
      'lateMinPercent',
      'missingDeductionPercent',
      'postManually',
    ]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    if (body.assignDate !== undefined)
      data.assignDate = body.assignDate ? new Date(body.assignDate) : null;
    if (body.dueDate !== undefined)
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.classDeadlines !== undefined)
      data.classDeadlines = Array.isArray(body.classDeadlines)
        ? body.classDeadlines
            .filter((d: any) => d?.className && d?.dueDate)
            .map((d: any) => ({
              className: String(d.className).trim(),
              dueDate: new Date(d.dueDate).toISOString(),
            }))
        : [];
    if (body.revealAnswersAt !== undefined)
      data.revealAnswersAt = body.revealAnswersAt
        ? new Date(body.revealAnswersAt)
        : null;
    if (body.minScoreForAnswers !== undefined)
      data.minScoreForAnswers =
        body.minScoreForAnswers === '' || body.minScoreForAnswers == null
          ? null
          : Number(body.minScoreForAnswers);
    if (body.maxResubmit !== undefined)
      data.maxResubmit =
        body.maxResubmit === '' || body.maxResubmit == null
          ? null
          : Math.max(0, Number(body.maxResubmit));
    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data,
    });
    // Đồng bộ số lần nộp tối đa sang đề thi
    if (updated.examId && (updated.maxAttempts ?? 0) > 0) {
      await this.prisma.exam.update({
        where: { id: updated.examId },
        data: { maxAttempts: updated.maxAttempts },
      });
    }
    return updated;
  }

  async remove(courseId: string, assignmentId: string, teacherId: string) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId);
    await this.prisma.assignment.delete({ where: { id: assignmentId } });
    return { deleted: true };
  }

  // ============ CHI TIẾT ============

  async detail(courseId: string, assignmentId: string, userId: string, role: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalScore: true,
            duration: true,
            items: {
              include: {
                question: {
                  select: {
                    id: true,
                    type: true,
                    content: true,
                    options: true,
                    answer: true,
                    solution: true,
                  },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        },
        course: { select: { teacherId: true } },
      },
    });
    if (!assignment || assignment.courseId !== courseId) {
      throw new NotFoundException('Không tìm thấy bài giao');
    }
    const isTeacher = await this.isCourseManager(courseId, userId);
    if (!isTeacher && role === 'STUDENT') {
      const en = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: userId } },
      });
      if (!en) throw new ForbiddenException('Chưa đăng ký khóa học');
    }

    // Nạp NỘI DUNG các câu tự luận đã chọn từ ngân hàng đề để học sinh ĐỌC ĐƯỢC ĐỀ BÀI.
    // Học sinh chỉ nhận content/options (KHÔNG nhận đáp án/lời giải).
    const qIds: string[] = Array.isArray((assignment as any).questionIds)
      ? ((assignment as any).questionIds as string[])
      : [];
    let bankQuestions: any[] = [];
    if (qIds.length) {
      const rows = await this.prisma.question.findMany({
        where: { id: { in: qIds } },
        select: isTeacher
          ? { id: true, code: true, type: true, content: true, options: true, answer: true, solution: true }
          : { id: true, code: true, type: true, content: true, options: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      bankQuestions = qIds.map((id) => byId.get(id)).filter(Boolean) as any[];
    }

    if (isTeacher) {
      const submissions = await this.prisma.assignmentSubmission.findMany({
        where: { assignmentId },
        orderBy: { submittedAt: 'asc' },
        include: {
          student: { select: { id: true, fullName: true, studentCode: true, className: true } },
        },
      });
      // Đồng bộ điểm theo bài thi (nếu lệch) để danh sách khớp với chi tiết chấm bài
      await this.syncSubmissionScores(submissions);
      const enrolled = await this.prisma.enrollment.findMany({
        where: { courseId },
        include: { student: { select: { id: true, fullName: true, studentCode: true, className: true } } },
        orderBy: { enrolledAt: 'asc' },
      });
      const submittedIds = new Set(submissions.map((s) => s.studentId));
      return {
        ...assignment,
        questions: bankQuestions,
        submissions,
        students: enrolled.map((e) => ({
          ...e.student,
          submitted: submittedIds.has(e.studentId),
        })),
      };
    }

    // Học sinh: bài nộp của mình + quy tắc hiện đáp án
    const mine = await this.prisma.assignmentSubmission.findUnique({
      where: {
        assignmentId_studentId: { assignmentId, studentId: userId },
      },
    });
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { className: true },
    });
    const showAnswers = this.showAnswersRule(assignment as any, mine);
    // Thông tin quyền nộp lại: số lượt sửa còn lại, đã bị khoá sau khi chấm chưa
    const histCount = mine
      ? await this.prisma.assignmentSubmissionHistory.count({
          where: { submissionId: mine.id },
        })
      : 0;
    const versionsUsed = mine ? Math.max(1, histCount) : 0;
    const editsUsed = Math.max(0, versionsUsed - 1);
    const maxResubmit =
      (assignment as any).maxResubmit === null ||
      (assignment as any).maxResubmit === undefined
        ? null
        : Number((assignment as any).maxResubmit);
    const gradedNow = mine
      ? mine.gradedAt != null || mine.status === 'GRADED' || mine.published === true
      : false;
    const dueNow = this.effectiveDueDate(assignment as any, me?.className || null);
    const pastDueNow = dueNow ? dueNow.getTime() < Date.now() : false;
    const lockedAfterGraded = (assignment as any).lockAfterGraded !== false;
    const resubmit = {
      isEssay: assignment.kind !== 'EXAM',
      editsUsed,
      maxResubmit,
      editsLeft: maxResubmit === null ? null : Math.max(0, maxResubmit - editsUsed),
      graded: gradedNow,
      lockedAfterGraded,
      pastDue: pastDueNow,
      canEdit: Boolean(
        assignment.kind !== 'EXAM' &&
          !pastDueNow &&
          (maxResubmit === null || editsUsed < maxResubmit) &&
          !(lockedAfterGraded && gradedNow),
      ),
    };
    return {
      ...assignment,
      questions: bankQuestions,
      resubmit,
      dueDate: this.effectiveDueDate(assignment as any, me?.className || null),
      // Không gửi nguyên annotations cho HS: chỉ gửi nét chấm khi điểm đã công bố
      mySubmission: mine
        ? (() => {
            const { annotations, ...rest } = mine as any;
            const a: any = assignment;
            const posted =
              !a.postManually ||
              a.gradesPosted ||
              (a.postAt && new Date(a.postAt).getTime() <= Date.now());
            return {
              ...rest,
              marks:
                mine.published && posted && annotations
                  ? {
                      boardSnapshots: annotations.boardSnapshots || {},
                      pdfBoard: annotations.pdfBoard || {},
                    }
                  : null,
            };
          })()
        : null,
      showAnswers,
      // KHÔNG gửi đáp án câu trắc nghiệm cho HS khi chưa được xem đáp án
      exam: showAnswers
        ? assignment.exam
        : {
            ...assignment.exam,
            items: assignment.exam?.items.map((it) => ({
              ...it,
              question: {
                ...it.question,
                answer: null,
                solution: null,
              },
            })),
          },
    };
  }

  // ============ HS NỘP BÀI ============

  async submit(
    courseId: string,
    assignmentId: string,
    studentId: string,
    body: any,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.courseId !== courseId) {
      throw new NotFoundException('Không tìm thấy bài giao');
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');

    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
    });
    // Cho phép học sinh SỬA / NỘP LẠI bài TỰ LUẬN khi CÒN HẠN NỘP
    const stu = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { className: true },
    });
    const dueAt = this.effectiveDueDate(assignment as any, stu?.className || null);
    const pastDue = dueAt ? dueAt.getTime() < Date.now() : false;
    const canEditBeforeDue = assignment.kind !== 'EXAM' && !pastDue;

    // Số lần đã nộp (mỗi lần nộp/sửa = 1 phiên bản trong lịch sử)
    let versionsUsed = existing
      ? await this.prisma.assignmentSubmissionHistory.count({
          where: { submissionId: existing.id },
        })
      : 0;
    // Tương thích dữ liệu cũ: đã có bài nộp nhưng chưa có lịch sử ⇒ coi như đã nộp 1 lần
    if (existing && versionsUsed === 0) versionsUsed = 1;
    const editsUsed = Math.max(0, versionsUsed - 1);

    if (existing && !assignment.allowResubmit && existing.status !== 'RETURNED') {
      if (!canEditBeforeDue) {
        throw new ForbiddenException(
          pastDue
            ? 'Đã hết hạn nộp nên không thể sửa bài. Hãy liên hệ giáo viên nếu cần nộp lại.'
            : 'Bạn đã nộp bài này rồi (chờ giáo viên yêu cầu nộp lại nếu cần sửa)',
        );
      }
      // Giới hạn số lần sửa
      const maxResubmit = (assignment as any).maxResubmit;
      if (maxResubmit !== null && maxResubmit !== undefined && editsUsed >= maxResubmit) {
        throw new ForbiddenException(
          maxResubmit === 0
            ? 'Bài giao này không cho phép sửa lại sau khi đã nộp.'
            : `Bạn đã dùng hết ${maxResubmit} lượt sửa bài. Hãy liên hệ giáo viên nếu cần nộp lại.`,
        );
      }
      // Khoá sửa khi giáo viên đã chấm
      const locked = (assignment as any).lockAfterGraded !== false;
      const graded =
        existing.gradedAt != null ||
        existing.status === 'GRADED' ||
        existing.published === true;
      if (locked && graded) {
        throw new ForbiddenException(
          'Giáo viên đã chấm bài nên không thể sửa. Hãy liên hệ giáo viên nếu cần nộp lại.',
        );
      }
    }

    const data: any = {
      content: body?.content || null,
      imageUrls: Array.isArray(body?.imageUrls) ? body.imageUrls : [],
      pdfUrl: body?.pdfUrl || null,
      answers: body?.answers || null,
      status: 'SUBMITTED',
      published: false,
      submittedAt: new Date(),
      aiScore: null,
      aiFeedback: null,
      score: null,
      assessment: null,
      teacherComment: null,
      gradedAt: null,
    };
    const submission = existing
      ? await this.prisma.assignmentSubmission.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.assignmentSubmission.create({
          data: {
            assignmentId,
            studentId,
            ...data,
          },
        });

    // Ghi LỊCH SỬ mỗi lần nộp (để giáo viên đối chiếu)
    try {
      await this.prisma.assignmentSubmissionHistory.create({
        data: {
          submissionId: submission.id,
          assignmentId,
          version: versionsUsed + 1,
          content: data.content,
          imageUrls: data.imageUrls,
          pdfUrl: data.pdfUrl,
          answers: data.answers,
        },
      });
    } catch {
      /* trùng version (nộp đồng thời) — bỏ qua, không chặn nộp bài */
    }

    // Thưởng XP nộp bài
    await this.gamification.awardXp(studentId, 15);

    // KHÔNG tự chấm AI nữa — giáo viên bấm nút "Chấm bằng AI" để chấm câu tự luận
    return submission;
  }

  // Lịch sử các lần nộp/sửa bài (để đối chiếu)
  async submissionHistory(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    userId: string,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, courseId: true },
    });
    if (!assignment || assignment.courseId !== courseId) {
      throw new NotFoundException('Không tìm thấy bài giao');
    }
    const sub = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, assignmentId: true, studentId: true },
    });
    if (!sub || sub.assignmentId !== assignmentId) {
      throw new NotFoundException('Không tìm thấy bài nộp');
    }
    const isTeacher = await this.isCourseManager(courseId, userId);
    if (!isTeacher && sub.studentId !== userId) {
      throw new ForbiddenException('Không có quyền xem lịch sử bài nộp này');
    }
    return this.prisma.assignmentSubmissionHistory.findMany({
      where: { submissionId },
      orderBy: { version: 'asc' },
    });
  }

  // GV bấm nút → AI chấm các câu TỰ LUẬN (trắc nghiệm tính điểm tự động từ đáp án đã lưu)
  async aiGrade(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    teacherId: string,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId, submissionId);
    return this.runAiGrade(submissionId);
  }

  // Tự động đồng bộ điểm thi vào TẤT CẢ bài giao (kind=EXAM) mà học sinh đã đăng ký.
  // Gọi ngay sau khi học sinh nộp bài thi trên giao diện thi online.
  async autoSyncExam(
    studentId: string,
    examId: string,
  ): Promise<{ synced: number; total: number }> {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: {
        examId,
        studentId,
        submittedAt: { not: null },
        score: { not: null },
      },
      // Luôn lấy lần thi ĐIỂM CAO NHẤT (đề cho thi lại nhiều lần)
      orderBy: [{ score: 'desc' }, { submittedAt: 'desc' }],
    });
    if (!attempt) return { synced: 0, total: 0 };

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { courseId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    if (!courseIds.length) return { synced: 0, total: 0 };

    const assignments = await this.prisma.assignment.findMany({
      where: { examId, kind: 'EXAM', courseId: { in: courseIds } },
      select: { id: true, courseId: true },
    });

    let synced = 0;
    for (const a of assignments) {
      const existing = await this.prisma.assignmentSubmission.findUnique({
        where: {
          assignmentId_studentId: { assignmentId: a.id, studentId },
        },
      });
      // Đã đồng bộ đúng lần làm này rồi → bỏ qua (tránh cộng XP lặp)
      if (existing && (existing.answers as any)?.attemptId === attempt.id) {
        continue;
      }
      await this.submitExamResult(a.courseId, a.id, studentId);
      synced++;
    }
    return { synced, total: assignments.length };
  }

  // HS làm đề thi qua giao diện THI ONLINE rồi bấm nộp kết quả vào bài giao
  async submitExamResult(
    courseId: string,
    assignmentId: string,
    studentId: string,
  ) {    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.courseId !== courseId) {
      throw new NotFoundException('Không tìm thấy bài giao');
    }
    if (assignment.kind !== 'EXAM' || !assignment.examId) {
      throw new ForbiddenException('Bài giao này không phải đề thi');
    }
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId } },
    });
    if (!enrollment) throw new ForbiddenException('Chưa đăng ký khóa học');

    const attempt = await this.prisma.examAttempt.findFirst({
      where: {
        examId: assignment.examId,
        studentId,
        submittedAt: { not: null },
        score: { not: null },
      },
      // Luôn lấy lần thi ĐIỂM CAO NHẤT (đề cho thi lại nhiều lần)
      orderBy: [{ score: 'desc' }, { submittedAt: 'desc' }],
    });
    if (!attempt) {
      throw new ForbiddenException(
        'Bạn chưa hoàn thành bài thi — hãy bấm "Bắt đầu làm bài" và nộp bài thi trước',
      );
    }

    const data: any = {
      content: '(làm trực tuyến trên hệ thống thi online)',
      answers: { __fromExam: true, attemptId: attempt.id, raw: attempt.answers },
      aiScore: attempt.score,
      aiComment: null, // điểm đổi → xoá nhận xét cũ để tạo lại
      aiFeedback: 'Điểm do hệ thống thi online chấm (trắc nghiệm tự động + tự luận AI). Giáo viên chốt điểm cuối.',
      status: 'SUBMITTED',
      published: false,
      submittedAt: new Date(),
    };

    // ===== TỰ CHỐT ĐIỂM: đề KHÔNG có câu tự luận → chốt ngay, không cần GV chỉnh =====
    const essayCount = await this.prisma.examItem.count({
      where: { examId: assignment.examId, question: { type: QuestionType.ESSAY } },
    });
    if (essayCount === 0) {
      data.score = attempt.score;
      data.published = true;
      data.aiFeedback = 'Điểm đã được hệ thống chốt tự động (đề chỉ có trắc nghiệm/điền số/đúng-sai, không có câu tự luận).';
    }
    const existing = await this.prisma.assignmentSubmission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
    });
    const submission = existing
      ? await this.prisma.assignmentSubmission.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.assignmentSubmission.create({
          data: { assignmentId, studentId, ...data },
        });
    await this.gamification.awardXp(studentId, 15);
    return submission;
  }

  // Chuyển PDF → ảnh trang (120dpi, tối đa 12 trang) để AI đọc
  private pdfToImages(pdfUrl: string): string[] {
    try {
      const filename = path.basename(pdfUrl);
      const src = path.join(process.cwd(), 'storage', 'uploads', filename);
      if (!fs.existsSync(src)) return [];
      const outBase = path.join(process.cwd(), 'storage', 'uploads', randomUUID());
      const gs = spawnSync(
        'gs',
        [
          '-sDEVICE=png16m',
          '-r120',
          '-dNOPAUSE',
          '-dBATCH',
          '-sOutputFile=' + outBase + '-%d.png',
          src,
        ],
        { timeout: 60000 },
      );
      if (gs.error) return [];
      const urls: string[] = [];
      for (let i = 1; i <= 12; i++) {
        const f = `${outBase}-${i}.png`;
        if (!fs.existsSync(f)) break;
        urls.push('/api/uploads/' + path.basename(f));
      }
      return urls;
    } catch {
      return [];
    }
  }

  // ============ CHẤM TỰ ĐỘNG / AI THÔ ============

  private async runAiGrade(submissionId: string) {
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) return;
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: submission.assignmentId },
      include: {
        exam: {
          include: {
            items: {
              include: { question: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
    if (!assignment) return;

    // Bài làm từ hệ thống thi online đã có điểm đầy đủ → không chấm lại
    const fromExam = (submission.answers as any)?.__fromExam;
    if (fromExam) {
      return this.prisma.assignmentSubmission.findUnique({
        where: { id: submissionId },
      });
    }

    let visionImages: string[] = submission.imageUrls || [];
    if (submission.pdfUrl) {
      visionImages = visionImages.concat(this.pdfToImages(submission.pdfUrl));
    }

    let score: number | null = null;
    let aiFeedback: string | null = null;

    if (assignment.kind === 'EXAM' && assignment.exam) {
      // Đề thi: trắc nghiệm chấm tự động + tự luận AI chấm thô
      const answers: Record<string, string> = (submission.answers as any) || {};
      let mcqScore = 0;
      const essayPrompts: { content: string; solution: string | null }[] = [];
      const essayScores: number[] = [];
      for (const item of assignment.exam.items) {
        const q: any = item.question;
        if (q.type === 'MCQ' || q.type === 'TRUE_FALSE') {
          if (answers[q.id] === q.answer) mcqScore += item.score || 0;
        } else {
          essayPrompts.push({ content: q.content, solution: q.solution });
        }
      }
      // Tự luận trong đề: AI chấm thô từng câu (theo thang 10)
      if (essayPrompts.length && (visionImages.length || submission.content)) {
        for (const p of essayPrompts.slice(0, 5)) {
          const ai = await this.ai.gradeEssayFull(
            p.content,
            p.solution || '',
            submission.content || '(xem ảnh)',
            visionImages,
          );
          if (ai && typeof ai.score === 'number') {
            // quy đổi tạm: điểm 10 → chia đều theo số câu tự luận trên thang 10 tổng đề
            essayScores.push(ai.score);
          }
        }
      }
      const totalExam = assignment.exam.totalScore || 10;
      const essayItems = assignment.exam.items.filter(
        (i) =>
          (i.question as any).type !== 'MCQ' &&
          (i.question as any).type !== 'TRUE_FALSE',
      );
      const essayWeight = essayItems.reduce((s, i) => s + (i.score || 0), 0);
      let essayTotal = 0;
      if (essayScores.length && essayWeight > 0) {
        // Điểm AI trung bình (thang 10) → quy về phần điểm tự luận của đề
        const avg10 =
          essayScores.reduce((a, b) => a + b, 0) / essayScores.length;
        essayTotal = (avg10 / 10) * essayWeight;
      }
      score = Math.min(
        totalExam,
        Math.round((mcqScore + essayTotal) * 100) / 100,
      );
      aiFeedback = essayPrompts.length
        ? `Trắc nghiệm đã chấm tự động; phần tự luận AI chấm thô — giáo viên chốt điểm cuối.`
        : `Chấm tự động toàn bộ trắc nghiệm.`;
    } else {
      // Tự luận / tự gõ đề: AI chấm thô toàn bài
      // Nếu bài giao chọn câu từ NGÂN HÀNG ĐỀ → nạp đề + lời giải làm căn cứ chấm
      const qIds: string[] = Array.isArray((assignment as any).questionIds)
        ? ((assignment as any).questionIds as string[])
        : [];
      let bankPrompt = '';
      if (qIds.length) {
        const rows = await this.prisma.question.findMany({
          where: { id: { in: qIds } },
          select: { id: true, content: true, answer: true, solution: true },
        });
        const byId = new Map(rows.map((r) => [r.id, r]));
        bankPrompt = qIds
          .map((id, i) => {
            const q: any = byId.get(id);
            if (!q) return '';
            const ans = q.answer ? `\nĐÁP ÁN: ${JSON.stringify(q.answer)}` : '';
            const sol = q.solution ? `\nLỜI GIẢI: ${q.solution}` : '';
            return `Câu ${i + 1}. ${q.content}${ans}${sol}`;
          })
          .filter(Boolean)
          .join('\n\n');
      }
      const promptText = [
        assignment.customContent,
        ...(assignment.customQuestions || []),
        bankPrompt,
      ]
        .filter(Boolean)
        .join('\n\n');
      const ai = await this.ai.gradeEssayFull(
        promptText || assignment.description || assignment.title,
        '',
        submission.content || '(xem ảnh/PDF)',
        visionImages,
      );
      if (ai && typeof ai.score === 'number') {
        score = Math.round(Math.max(0, Math.min(10, ai.score)) * 100) / 100;
        aiFeedback = ai.suggestion || null;
      }
    }

    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: { aiScore: score, aiFeedback, aiComment: null },
    });
    return updated;
  }

  // ============ GV CHỐT ĐIỂM ============

  // GV xem bài làm đề thi của học sinh (trắc nghiệm + tự luận) để chấm
  async examReview(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    teacherId: string,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId, submissionId);
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy bài nộp');
    const fromExam = (submission.answers as any)?.__fromExam;
    if (!fromExam) {
      throw new ForbiddenException('Bài nộp này không phải từ hệ thống thi online');
    }
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: submission.assignmentId },
    });
    if (!assignment?.examId) {
      throw new ForbiddenException('Bài giao không gắn đề thi');
    }
    const attemptId = (submission.answers as any)?.attemptId;
    const review = await this.exams.getAttemptDetailForTeacher(
      teacherId,
      assignment.examId,
      attemptId,
    );
    return {
      ...review,
      essayScores: (submission.essayScores as any) || null,
      aiScore: submission.aiScore,
      teacherComment: submission.teacherComment,
      assessment: submission.assessment,
      published: submission.published,
      score: submission.score,
    };
  }

  async grade(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    teacherId: string,
    body: any,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId, submissionId);
    const submission = await this.prisma.assignmentSubmission.findUnique({
      where: { id: submissionId },
    });
    const data: any = {
      status: 'GRADED',
      gradedAt: new Date(),
      published: !!body?.published,
    };

    // Chấm đề thi: điểm = trắc nghiệm (tự động) + tổng điểm thủ công các phần tự luận
    if (body?.essayScores !== undefined && (submission?.answers as any)?.__fromExam) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: submission!.assignmentId },
      });
      const review = await this.exams.getAttemptDetailForTeacher(
        teacherId,
        assignment!.examId!,
        (submission!.answers as any)?.attemptId,
      );
      const essayScores: Record<string, number[]> =
        body.essayScores || {};
      let essaySum = 0;
      for (const k of Object.keys(essayScores)) {
        for (const v of essayScores[k]) {
          essaySum += Number(v) || 0;
        }
      }
      essaySum = Math.round(essaySum * 100) / 100;
      const total = Math.min(
        review.totalScore,
        Math.round((review.mcqScore + essaySum) * 100) / 100,
      );
      data.score = total;
      data.essayScores = essayScores;
      data.aiScore = review.mcqScore + essaySum; // điểm hệ thống = TN + TL đã chấm
    } else if (body.score !== undefined && body.score !== '') {
      data.score = Number(body.score);
    }
    if (body.assessment !== undefined) data.assessment = body.assessment || null;
    if (body.teacherComment !== undefined)
      data.teacherComment = body.teacherComment || null;

    // ===== CHÍNH SÁCH NỘP MUỘN (Canvas late_policy) =====
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: submission!.assignmentId },
    });
    const studentRec = submission?.studentId
      ? await this.prisma.user.findUnique({
          where: { id: submission.studentId },
          select: { className: true },
        })
      : null;
    const effDue = this.effectiveDueDate(
      assignment as any,
      studentRec?.className || null,
    );
    if (
      effDue &&
      assignment.lateDeductionPercent &&
      submission?.submittedAt &&
      data.score != null
    ) {
      const due = effDue.getTime();
      const sub = new Date(submission.submittedAt).getTime();
      if (sub > due) {
        const intervals = Math.ceil(
          (sub - due) / 3600000 / (assignment.lateIntervalHours || 24),
        );
        const base = Number(data.score);
        let final = base - base * (assignment.lateDeductionPercent / 100) * intervals;
        if (assignment.lateMinPercent != null) {
          const floor = base * (assignment.lateMinPercent / 100);
          if (final < floor) final = floor;
        }
        data.score = Math.max(0, Math.round(final * 100) / 100);
        data.penaltyPoints = Math.round((base - Number(data.score)) * 100) / 100;
      }
    }
    // Bài KHÔNG nộp (quá hạn): trừ riêng theo missing_deduction
    if (
      effDue &&
      assignment.missingDeductionPercent &&
      !submission?.submittedAt &&
      data.score != null &&
      effDue.getTime() < Date.now()
    ) {
      const base = Number(data.score);
      const final = Math.max(
        0,
        base - base * (assignment.missingDeductionPercent / 100),
      );
      data.score = Math.round(final * 100) / 100;
      data.penaltyPoints = Math.round((base - Number(data.score)) * 100) / 100;
    }

    // Điểm có thể đổi → xoá nhận xét cũ để lần xuất sau tạo lại theo điểm mới
    data.aiComment = null;

    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data,
    });

    if (data.published && !assignment?.postManually) {
      await this.prisma.notification.create({
        data: {
          userId: updated.studentId,
          title: '✅ Bài tập đã có điểm',
          body: `Điểm: ${updated.score ?? '—'} — xem nhận xét của giáo viên ngay!`,
          link: `/student/courses/${courseId}?tab=assignments`,
        },
      });
    }
    return updated;
  }

  // ===== POST POLICY: công bố / ẩn điểm đồng loạt =====
  async postGrades(
    courseId: string,
    assignmentId: string,
    teacherId: string,
    body: any,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId);
    const data: any = {};
    if (body?.posted !== undefined) data.gradesPosted = !!body.posted;
    if (body?.postAt !== undefined) {
      data.postAt = body.postAt ? new Date(body.postAt) : null;
    }
    const assignment = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data,
    });

    // Khi công bố → thông báo tới học sinh có điểm đã chốt
    let notified = 0;
    if (data.gradesPosted) {
      const subs = await this.prisma.assignmentSubmission.findMany({
        where: { assignmentId, published: true, score: { not: null } },
        select: { studentId: true, score: true },
      });
      notified = subs.length;
      for (const s of subs) {
        await this.prisma.notification.create({
          data: {
            userId: s.studentId,
            title: '📢 Điểm đã được công bố',
            body: `Điểm bài "${assignment.title}": ${s.score ?? '—'}. Mở khóa học để xem nhận xét.`,
            link: `/student/courses/${courseId}?tab=assignments`,
          },
        });
      }
    }
    return { ...assignment, notified };
  }

  // Chấm lại toàn bộ bài làm CỦA BÀI TẬP NÀY (đề thi được gán vào khóa học)
  async regradeAssignment(courseId: string, assignmentId: string, teacherId: string) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId);
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || !assignment.examId) {
      throw new NotFoundException('Bài tập này không phải đề thi (không có examId)');
    }
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
    });
    const attemptIds: string[] = [];
    for (const s of submissions) {
      const ans = (s.answers as any) || {};
      const aid = typeof ans === 'object' ? ans.attemptId : null;
      if (aid && !attemptIds.includes(aid)) attemptIds.push(aid);
    }
    if (!attemptIds.length) {
      return { total: 0, changed: 0, synced: 0, message: 'Chưa có bài nộp nào (đề thi) để chấm lại' };
    }
    const result = await this.exams.regradeAttempts(assignment.examId, teacherId, attemptIds);
    // Đồng bộ điểm hệ thống (aiScore) + tự điền score nếu chưa có điểm tay
    let synced = 0;
    for (const s of submissions) {
      const ans = (s.answers as any) || {};
      const aid = ans?.attemptId;
      if (!aid || result.scores[aid] === undefined) continue;
      synced++;
      await this.prisma.assignmentSubmission.update({
        where: { id: s.id },
        data: {
          aiScore: result.scores[aid],
          ...(s.score == null ? { score: result.scores[aid] } : {}),
          aiComment: null, // điểm đổi → xoá nhận xét cũ
        },
      });
    }
    return { total: result.total, changed: result.changed, synced, scores: result.scores };
  }

  // Xuất bảng điểm của bài tập (PDF / Excel) — gồm toàn bộ học sinh đã đăng ký khóa học
  async exportScores(
    courseId: string,
    assignmentId: string,
    teacherId: string,
    format: string,
    className?: string,
    opts?: { comments?: boolean; sort?: boolean },
  ) {
    const withComments = opts?.comments !== false;
    const withSort = opts?.sort !== false;
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId);
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Không tìm thấy bài giao');
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { title: true },
    });

    const cls = className && className.trim() ? className.trim() : '';
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        ...(cls ? { student: { className: cls } } : {}),
      },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId },
    });
    // Đồng bộ điểm theo bài thi (nếu lệch) để bảng điểm khớp với chi tiết chấm bài
    await this.syncSubmissionScores(submissions);
    const subByStudent = new Map(submissions.map((s) => [s.studentId, s]));

    // Gom dữ liệu đúng/sai theo chủ đề (nếu bài giao là đề thi) để AI nhận xét sát
    const examItemsWithTopic = assignment.examId
      ? await this.prisma.examItem.findMany({
          where: { examId: assignment.examId },
          include: { question: { include: { topic: true } } },
          orderBy: { order: 'asc' },
        })
      : [];
    const attemptIds = submissions
      .map((s) => (s.answers as any)?.attemptId)
      .filter((x): x is string => typeof x === 'string' && !!x);
    const attemptsMap = new Map<string, any>();
    if (attemptIds.length) {
      const ats = await this.prisma.examAttempt.findMany({
        where: { id: { in: attemptIds } },
      });
      for (const a of ats) attemptsMap.set(a.id, a);
    }
    const perfOf = (s: any) => {
      const attemptId = (s?.answers as any)?.attemptId;
      const attempt = attemptId ? attemptsMap.get(attemptId) : null;
      if (!attempt || !examItemsWithTopic.length) {
        return {
          correctTopics: [] as string[],
          wrongTopics: [] as string[],
          weakTypes: [] as string[],
        };
      }
      const ans = (attempt.answers as any) || {};
      const correct = new Set<string>();
      const wrong = new Set<string>();
      const weakTypes = new Set<string>();
      for (const it of examItemsWithTopic) {
        const q = it.question as any;
        if (!q || q.type === 'ESSAY') continue; // tự luận không chấm tự động
        const label = q.topic?.name || q.form || 'Dạng khác';
        if (this.exams.isAnswerCorrect(q, ans[it.id])) {
          correct.add(label);
        } else {
          wrong.add(label);
          weakTypes.add(
            q.type === 'TRUE_FALSE'
              ? 'Đúng/Sai'
              : q.type === 'SHORT_ANSWER'
                ? 'Trả lời ngắn'
                : 'Trắc nghiệm',
          );
        }
      }
      return {
        correctTopics: [...correct],
        wrongTopics: [...wrong],
        weakTypes: [...weakTypes],
      };
    };

    // Gom + tính điểm hiệu dụng để SẮP XẾP CAO → THẤP (chưa nộp xếp cuối)
    const scored = enrollments.map((en) => {
      const st = en.student as any;
      const s = subByStudent.get(st.id) || null;
      const eff = s ? (s.score ?? s.aiScore) : null;
      return { st, s, eff };
    });
    if (withSort) scored.sort((a, b) => {
      const an = a.eff == null ? -Infinity : a.eff;
      const bn = b.eff == null ? -Infinity : b.eff;
      if (bn !== an) return bn - an;
      return String(a.st.fullName || '').localeCompare(String(b.st.fullName || ''));
    });

    // Xác định trạng thái nộp
    const statusOf = (s: any, className: string | null) => {
      if (!s) return 'Chưa nộp';
      const due = this.effectiveDueDate(assignment as any, className);
      if (due && s.submittedAt) {
        return new Date(s.submittedAt).getTime() > due.getTime()
          ? 'Nộp muộn'
          : 'Đúng hạn';
      }
      return 'Đã nộp';
    };

    // Tự động tạo nhận xét (AI) cho học sinh đã có điểm nhưng GV chưa nhận xét
    const needComment = withComments
      ? scored.filter(
          ({ s, eff }) => s && eff != null && !s.teacherComment && !s.aiComment,
        )
      : [];
    if (needComment.length) {
      const gens = needComment.map(({ st, s, eff }) => {
        const perf = perfOf(s);
        return {
          fullName: st.fullName || 'Học sinh',
          score: typeof eff === 'number' ? eff : null,
          status: statusOf(s, st.className || null),
          correctTopics: perf.correctTopics,
          wrongTopics: perf.wrongTopics,
          weakTypes: perf.weakTypes,
        };
      });
      const gen = await this.ai.generateShortComments(gens);
      for (let i = 0; i < needComment.length; i++) {
        const c = gen[i];
        const sub = needComment[i].s;
        if (c && sub) {
          sub.aiComment = c;
          await this.prisma.assignmentSubmission.update({
            where: { id: sub.id },
            data: { aiComment: c },
          });
        }
      }
    }

    const fallbackComment = (score: number | null): string => {
      if (score == null) {
        return 'Điểm mạnh: —\nĐiểm yếu: Chưa nộp bài.\nLời khuyên: Cần nộp bài đúng hạn.';
      }
      if (score >= 9) {
        return 'Điểm mạnh: Nắm chắc kiến thức, làm bài tốt.\nĐiểm yếu: Cần cẩn thận hơn ở các câu khó.\nLời khuyên: Tiếp tục phát huy, luyện thêm câu vận dụng cao.';
      }
      if (score >= 7) {
        return 'Điểm mạnh: Hiểu bài, làm được phần lớn câu hỏi.\nĐiểm yếu: Còn vài lỗi tính toán nhỏ.\nLời khuyên: Kiểm tra lại bài trước khi nộp.';
      }
      if (score >= 5) {
        return 'Điểm mạnh: Nắm được kiến thức cơ bản.\nĐiểm yếu: Còn yếu phần vận dụng.\nLời khuyên: Ôn lại lý thuyết và luyện thêm bài tập cơ bản.';
      }
      return 'Điểm mạnh: —\nĐiểm yếu: Chưa nắm chắc kiến thức cơ bản.\nLời khuyên: Cần ôn lại lý thuyết và nhờ thầy hướng dẫn thêm.';
    };

    const rows: Record<string, any>[] = [];
    const scores: number[] = [];
    for (const { st, s, eff } of scored) {
      const status = statusOf(s, st.className || null);
      if (eff != null && typeof eff === 'number') scores.push(eff);
      const comment =
        (s?.teacherComment && String(s.teacherComment).trim()) ||
        (s?.aiComment && String(s.aiComment).trim()) ||
        (s ? fallbackComment(eff) : 'Chưa nộp bài.');
      const row: Record<string, any> = {
        STT: rows.length + 1,
        'Họ và tên': st.fullName || '',
        'Lớp': st.className || '',
        'Điểm': eff != null ? eff : '—',
      };
      if (withComments) row['Nhận xét của GV'] = comment;
      row['Trạng thái'] = status;
      rows.push(row);
    }

    // ===== Thống kê =====
    const sorted = [...scores].sort((a, b) => a - b);
    const n = sorted.length;
    const quantile = (p: number) => {
      if (!n) return 0;
      const idx = (n - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return round1(sorted[lo]);
      return round1(sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo));
    };
    const round1 = (x: number) => Math.round(x * 100) / 100;
    const mean = n ? round1(sorted.reduce((a, b) => a + b, 0) / n) : 0;
    const median = quantile(0.5);
    const q1 = quantile(0.25);
    const q2 = median;
    const q3 = quantile(0.75);
    const variance = n
      ? round1(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
      : 0;
    const std = round1(Math.sqrt(variance));
    const min = n ? sorted[0] : 0;
    const max = n ? sorted[n - 1] : 0;

    // Phổ điểm theo 10 khoảng: 0-1, 1-2, ..., 9-10
    const bins = Array.from({ length: 10 }, (_, i) => ({
      label: `${i}-${i + 1}`,
      lo: i,
      hi: i === 9 ? 10.01 : i + 1,
      count: 0,
    }));
    for (const sc of scores) {
      const b = bins.find((b) => sc >= b.lo && sc < b.hi);
      if (b) b.count++;
    }

    const subtitle = `${assignment.title} — ${course?.title || ''}${cls ? ` — Lớp: ${cls}` : ''} (${enrollments.length} học sinh)`;
    const baseName = safeFilename(`bang-diem-${assignment.title}${cls ? '-' + cls : ''}`);

    if (format === 'xlsx') {
      const statRows: Record<string, any>[] = [
        { 'Chỉ số': 'Số bài đã nộp', 'Giá trị': n },
        { 'Chỉ số': 'Chưa nộp', 'Giá trị': enrollments.length - n },
        { 'Chỉ số': 'Điểm trung bình', 'Giá trị': mean },
        { 'Chỉ số': 'Điểm trung vị', 'Giá trị': median },
        { 'Chỉ số': 'Tứ phân vị Q1 (25%)', 'Giá trị': q1 },
        { 'Chỉ số': 'Tứ phân vị Q2 (50%)', 'Giá trị': q2 },
        { 'Chỉ số': 'Tứ phân vị Q3 (75%)', 'Giá trị': q3 },
        { 'Chỉ số': 'Phương sai', 'Giá trị': variance },
        { 'Chỉ số': 'Độ lệch chuẩn', 'Giá trị': std },
        { 'Chỉ số': 'Cao nhất', 'Giá trị': max },
        { 'Chỉ số': 'Thấp nhất', 'Giá trị': min },
      ];
      const distRows = bins.map((b) => ({
        'Khoảng điểm': b.label,
        'Số học sinh': b.count,
      }));
      const ws1 = XLSX.utils.json_to_sheet(rows);
      const ws2 = XLSX.utils.json_to_sheet(statRows);
      const ws3 = XLSX.utils.json_to_sheet(distRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Bảng điểm');
      XLSX.utils.book_append_sheet(wb, ws2, 'Thống kê');
      XLSX.utils.book_append_sheet(wb, ws3, 'Phổ điểm');
      return {
        buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        filename: `${baseName}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    // ===== PDF: thống kê + phổ điểm (biểu đồ) + bảng chi tiết =====
    const maxCount = Math.max(1, ...bins.map((b) => b.count));
    const BAR_W = 0.62;
    const STEP = 0.9;
    const bars = bins
      .map((b, i) => {
        const h = ((b.count / maxCount) * 4.5).toFixed(2);
        const x = (i * STEP).toFixed(2);
        const cx = (i * STEP + BAR_W / 2).toFixed(2);
        return [
          `\\fill[red!70!black,opacity=0.8] (${x},0) rectangle ++(${BAR_W},${h});`,
          `\\node[below,font=\\scriptsize] at (${cx},0) {${b.label}};`,
          `\\node[above,font=\\scriptsize] at (${cx},${h}) {${b.count}};`,
        ].join('\n');
      })
      .join('\n');

    const headers = withComments
      ? ['STT', 'Họ và tên', 'Lớp', 'Điểm', 'Nhận xét của GV', 'Trạng thái']
      : ['STT', 'Họ và tên', 'Lớp', 'Điểm', 'Trạng thái'];
    const tex = [
      '\\documentclass[12pt,a4paper]{article}',
      '\\usepackage{vntex}',
      '\\usepackage{amsmath}',
      '\\usepackage{amssymb}',
      '\\usepackage{longtable}',
      '\\usepackage{geometry}',
      '\\usepackage{tikz}',
      '\\usetikzlibrary{patterns}',
      '\\geometry{margin=1.5cm}',
      '\\begin{document}',
      '\\begin{center}',
      '{\\Large\\bfseries BẢNG ĐIỂM BÀI TẬP} \\\\[4pt]',
      `\\textit{${escapeTex(subtitle)}}`,
      '\\end{center}',
      '\\vspace{6pt}',
      '\\section*{Thống kê}',
      '\\begin{tabular}{|l|c|l|c|}',
      '\\hline',
      `Số bài đã nộp & ${n} & Chưa nộp & ${enrollments.length - n} \\\\ \\hline`,
      `Điểm trung bình & ${mean} & Điểm trung vị & ${median} \\\\ \\hline`,
      `Tứ phân vị Q1 & ${q1} & Tứ phân vị Q3 & ${q3} \\\\ \\hline`,
      `Phương sai & ${variance} & Độ lệch chuẩn & ${std} \\\\ \\hline`,
      `Cao nhất & ${max} & Thấp nhất & ${min} \\\\ \\hline`,
      '\\end{tabular}',
      '\\section*{Phổ điểm}',
      '\\begin{center}',
      '\\begin{tikzpicture}[scale=0.95]',
      bars,
      '\\end{tikzpicture}',
      '\\end{center}',
      '\\section*{Danh sách chi tiết}',
      withComments
        ? `\\begin{longtable}{|c|p{4.2cm}|c|c|p{6.5cm}|c|}`
        : `\\begin{longtable}{|c|p{6cm}|c|c|c|}`,
      '\\hline',
      `${headers.map((h) => `\\textbf{${escapeTex(h)}}`).join(' & ')} \\\\ \\hline`,
      '\\endfirsthead',
      '\\hline',
      `${headers.map((h) => `\\textbf{${escapeTex(h)}}`).join(' & ')} \\\\ \\hline`,
      '\\endhead',
      '\\hline',
      '\\endfoot',
      ...rows.map(
        (r) =>
          headers.map((h) => escapeTex(String(r[h] ?? ''))).join(' & ') +
          ' \\\\ \\hline',
      ),
      '\\end{longtable}',
      '\\end{document}',
    ].join('\n');

    return {
      buffer: await this.exams.compileRaw(tex),
      filename: `${baseName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  // Xuất BẢNG ĐIỂM NHIỀU BÀI TẬP chung một bảng xếp hạng (điểm trung bình, có hệ số)
  async exportScoresMulti(
    courseId: string,
    assignmentIds: string[],
    teacherId: string,
    format: string,
    className: string | undefined,
    opts: {
      comments: boolean;
      sort: boolean;
      weights?: number[]; // hệ số theo đúng thứ tự assignmentIds (mặc định 1)
      missingZero?: boolean; // true: chưa nộp = 0 điểm; false: bỏ qua bài đó khi tính TB
      markLate?: boolean; // đánh dấu * cho bài nộp muộn
    },
  ) {
    const missingZero = opts.missingZero !== false;
    const markLate = !!opts.markLate;
    await this.ensureTeacher(courseId, teacherId);
    // giữ thứ tự chọn, khử trùng lặp nhưng vẫn giữ hệ số tương ứng
    const ids: string[] = [];
    const wts: number[] = [];
    assignmentIds.forEach((id, i) => {
      if (!id || ids.indexOf(id) >= 0) return;
      ids.push(id);
      const w = opts.weights ? Number(opts.weights[i]) : 1;
      wts.push(isFinite(w) && w > 0 && w <= 100 ? w : 1);
    });
    if (!ids.length) throw new BadRequestException('Chưa chọn bài tập nào');
    if (ids.length > 30) throw new BadRequestException('Chỉ chọn tối đa 30 bài tập');
    const found = await this.prisma.assignment.findMany({
      where: { id: { in: ids }, courseId },
    });
    if (found.length !== ids.length) {
      throw new NotFoundException('Có bài tập không thuộc khóa học này');
    }
    const assignments = ids.map((id) => found.find((a) => a.id === id)!);
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { title: true },
    });
    const cls = className && className.trim() ? className.trim() : '';
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, ...(cls ? { student: { className: cls } } : {}) },
      include: { student: true },
      orderBy: { student: { fullName: 'asc' } },
    });
    const subs = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId: { in: ids } },
    });
    await this.syncSubmissionScores(subs);
    const subMap = new Map<string, any>();
    for (const s of subs) subMap.set(`${s.assignmentId}|${s.studentId}`, s);

    const r2 = (x: number) => Math.round(x * 100) / 100;
    const colName = (i: number) => `B${i + 1}`;
    const nA = assignments.length;
    const hasWeights = wts.some((w) => w !== 1);

    const people = enrollments.map((en) => {
      const st = en.student as any;
      const per = assignments.map((a) => {
        const s = subMap.get(`${a.id}|${st.id}`);
        const eff = s ? (s.score ?? s.aiScore) : null;
        const has = typeof eff === 'number';
        let late = false;
        if (s && s.submittedAt) {
          const due = this.effectiveDueDate(a as any, st.className || null);
          late = !!due && new Date(s.submittedAt).getTime() > due.getTime();
        }
        return { s, score: has ? (eff as number) : 0, has, late };
      });
      let num = 0;
      let den = 0;
      per.forEach((p, i) => {
        if (p.has || missingZero) {
          num += wts[i] * p.score;
          den += wts[i];
        }
      });
      const avg = den > 0 ? num / den : 0;
      const submitted = per.filter((p) => p.has).length;
      const comment = per
        .map((p, i) => {
          const c =
            (p.s?.teacherComment && String(p.s.teacherComment).trim()) ||
            (p.s?.aiComment && String(p.s.aiComment).trim()) ||
            '';
          return c ? `${colName(i)}: ${c.replace(/\s*\n\s*/g, ' ')}` : '';
        })
        .filter(Boolean)
        .join(' | ');
      return { st, per, avg, submitted, comment };
    });
    if (opts.sort) {
      people.sort((a, b) => {
        if (b.avg !== a.avg) return b.avg - a.avg;
        return String(a.st.fullName || '').localeCompare(String(b.st.fullName || ''));
      });
    }
    const rankOf: number[] = [];
    people.forEach((p, i) => {
      rankOf.push(i > 0 && p.avg === people[i - 1].avg ? rankOf[i - 1] : i + 1);
    });

    const rows: Record<string, any>[] = people.map((p, i) => {
      const row: Record<string, any> = {};
      row[opts.sort ? 'Hạng' : 'STT'] = opts.sort ? rankOf[i] : i + 1;
      row['Họ và tên'] = p.st.fullName || '';
      row['Lớp'] = p.st.className || '';
      assignments.forEach((_, k) => {
        const c = p.per[k];
        if (!c.has) row[colName(k)] = missingZero ? 0 : '—';
        else row[colName(k)] = markLate && c.late ? `${c.score}*` : c.score;
      });
      row['Đã nộp'] = `${p.submitted}/${nA}`;
      row['Điểm TB'] = r2(p.avg);
      if (opts.comments) row['Nhận xét'] = p.comment;
      return row;
    });

    // ===== Thống kê =====
    const avgs = people.map((p) => p.avg).sort((a, b) => a - b);
    const n = avgs.length;
    const quantile = (arr: number[], pr: number) => {
      if (!arr.length) return 0;
      const idx = (arr.length - 1) * pr;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return r2(arr[lo] + (arr[hi] - arr[lo]) * (idx - lo));
    };
    const mean = n ? r2(avgs.reduce((t, x) => t + x, 0) / n) : 0;
    const variance = n ? r2(avgs.reduce((t, x) => t + (x - mean) ** 2, 0) / n) : 0;
    const statRows: Record<string, any>[] = [
      { 'Chỉ số': 'Số học sinh', 'Giá trị': n },
      { 'Chỉ số': 'Điểm TB chung (của điểm TB)', 'Giá trị': mean },
      { 'Chỉ số': 'Trung vị', 'Giá trị': quantile(avgs, 0.5) },
      { 'Chỉ số': 'Tứ phân vị Q1', 'Giá trị': quantile(avgs, 0.25) },
      { 'Chỉ số': 'Tứ phân vị Q3', 'Giá trị': quantile(avgs, 0.75) },
      { 'Chỉ số': 'Độ lệch chuẩn', 'Giá trị': r2(Math.sqrt(variance)) },
      { 'Chỉ số': 'Cao nhất', 'Giá trị': n ? r2(avgs[n - 1]) : 0 },
      { 'Chỉ số': 'Thấp nhất', 'Giá trị': n ? r2(avgs[0]) : 0 },
      { 'Chỉ số': 'Học sinh nộp đủ mọi bài', 'Giá trị': people.filter((p) => p.submitted === nA).length },
      { 'Chỉ số': 'Học sinh chưa nộp bài nào', 'Giá trị': people.filter((p) => p.submitted === 0).length },
    ];
    // thống kê từng bài (trên học sinh đã nộp)
    const perAssign = assignments.map((a, k) => {
      const sc = people.filter((p) => p.per[k].has).map((p) => p.per[k].score);
      return {
        'Cột': colName(k),
        'Bài tập': a.title,
        'Hệ số': wts[k],
        'Đã nộp': sc.length,
        'Chưa nộp': n - sc.length,
        'Điểm TB bài': sc.length ? r2(sc.reduce((t, x) => t + x, 0) / sc.length) : '—',
      };
    });
    const bins = Array.from({ length: 10 }, (_, i) => ({
      label: `${i}-${i + 1}`,
      lo: i,
      hi: i === 9 ? 10.01 : i + 1,
      count: 0,
    }));
    for (const v of avgs) {
      const bi = bins.find((x) => v >= x.lo && v < x.hi);
      if (bi) bi.count++;
    }

    const subtitle = `${course?.title || ''}${cls ? ` — Lớp: ${cls}` : ''} — ${nA} bài tập (${enrollments.length} học sinh)`;
    const baseName = safeFilename(
      `bang-diem-tong-hop-${course?.title || 'khoa-hoc'}${cls ? '-' + cls : ''}`,
    );
    const note =
      `Điểm TB = ${hasWeights ? 'trung bình có hệ số' : 'trung bình cộng'}; ` +
      (missingZero ? 'bài chưa nộp tính 0 điểm' : 'bài chưa nộp được bỏ qua') +
      (markLate ? '; dấu * = nộp muộn' : '') +
      '.';

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Bảng điểm');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(statRows.concat([{ 'Chỉ số': 'Ghi chú', 'Giá trị': note }])),
        'Thống kê',
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perAssign), 'Từng bài');
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(bins.map((x) => ({ 'Khoảng điểm TB': x.label, 'Số học sinh': x.count }))),
        'Phổ điểm',
      );
      return {
        buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        filename: `${baseName}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    // PDF
    const headers = Object.keys(rows[0] || { STT: 1, 'Họ và tên': '', 'Điểm TB': 0 });
    const colSpec =
      '|c|p{4cm}|c|' + 'c|'.repeat(nA) + 'c|c|' + (opts.comments ? 'p{5cm}|' : '');
    const head = headers.map((h) => `\\textbf{${escapeTex(h)}}`).join(' & ');
    const statLine = (a: string, v: any, b: string, w: any) =>
      `${escapeTex(a)} & ${escapeTex(String(v))} & ${escapeTex(b)} & ${escapeTex(String(w))} \\\\ \\hline`;
    const tex = [
      '\\documentclass[10pt,a4paper,landscape]{article}',
      '\\usepackage{vntex}',
      '\\usepackage{amsmath}',
      '\\usepackage{longtable}',
      '\\usepackage{geometry}',
      '\\geometry{margin=1.3cm}',
      '\\begin{document}',
      '\\begin{center}',
      '{\\Large\\bfseries BẢNG ĐIỂM TỔNG HỢP BÀI TẬP VỀ NHÀ} \\\\[4pt]',
      `\\textit{${escapeTex(subtitle)}}`,
      '\\end{center}',
      `{\\small ${escapeTex(note)}}`,
      '\\vspace{4pt}',
      `\\begin{longtable}{${colSpec}}`,
      '\\hline',
      `${head} \\\\ \\hline`,
      '\\endfirsthead',
      '\\hline',
      `${head} \\\\ \\hline`,
      '\\endhead',
      '\\hline',
      '\\endfoot',
      ...rows.map(
        (r) => headers.map((h) => escapeTex(String(r[h] ?? ''))).join(' & ') + ' \\\\ \\hline',
      ),
      '\\end{longtable}',
      '\\subsection*{Thống kê điểm trung bình}',
      '\\begin{tabular}{|l|c|l|c|}',
      '\\hline',
      statLine('Số học sinh', n, 'Điểm TB chung', mean),
      statLine('Trung vị', statRows[2]['Giá trị'], 'Độ lệch chuẩn', statRows[5]['Giá trị']),
      statLine('Q1', statRows[3]['Giá trị'], 'Q3', statRows[4]['Giá trị']),
      statLine('Cao nhất', statRows[6]['Giá trị'], 'Thấp nhất', statRows[7]['Giá trị']),
      statLine('Nộp đủ mọi bài', statRows[8]['Giá trị'], 'Chưa nộp bài nào', statRows[9]['Giá trị']),
      '\\end{tabular}',
      '\\subsection*{Danh sách bài tập}',
      '\\begin{longtable}{|c|p{12cm}|c|c|c|c|}',
      '\\hline',
      '\\textbf{Cột} & \\textbf{Bài tập} & \\textbf{Hệ số} & \\textbf{Đã nộp} & \\textbf{Chưa nộp} & \\textbf{TB bài} \\\\ \\hline',
      ...perAssign.map(
        (l) =>
          `${escapeTex(l['Cột'])} & ${escapeTex(l['Bài tập'])} & ${l['Hệ số']} & ${l['Đã nộp']} & ${l['Chưa nộp']} & ${escapeTex(String(l['Điểm TB bài']))} \\\\ \\hline`,
      ),
      '\\end{longtable}',
      '\\end{document}',
    ].join('\n');
    return {
      buffer: await this.exams.compileRaw(tex),
      filename: `${baseName}.pdf`,
      contentType: 'application/pdf',
    };
  }

  // ===== NGÂN HÀNG NHẬN XÉT =====
  listCommentTemplates(teacherId: string) {
    return this.prisma.commentTemplate.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
  }
  createCommentTemplate(teacherId: string, body: any) {
    return this.prisma.commentTemplate.create({
      data: {
        teacherId,
        text: String(body?.text || '').trim(),
        category: body?.category || null,
      },
    });
  }
  async deleteCommentTemplate(teacherId: string, id: string) {
    await this.prisma.commentTemplate.deleteMany({
      where: { id, teacherId },
    });
    return { ok: true };
  }

  // Yêu cầu nộp lại
  async returnSubmission(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    teacherId: string,
    note?: string,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId, submissionId);
    const updated = await this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: { status: 'RETURNED', published: false },
    });
    await this.prisma.notification.create({
      data: {
        userId: updated.studentId,
        title: '🔁 Giáo viên yêu cầu nộp lại bài',
        body: note || 'Hãy xem lại bài làm và nộp lại nhé!',
        link: `/student/courses/${courseId}?tab=assignments`,
      },
    });
    return updated;
  }

  // Lưu nét vẽ chấm bài (annotations)
  async saveAnnotations(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    teacherId: string,
    annotations: any,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId, submissionId);
    return this.prisma.assignmentSubmission.update({
      where: { id: submissionId },
      data: { annotations: annotations || null },
    });
  }

  // ============ BẢNG XẾP HẠNG ============

  async leaderboard(courseId: string, assignmentId: string, userId: string, role: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: { select: { teacherId: true } } },
    });
    if (!assignment || assignment.courseId !== courseId) {
      throw new NotFoundException('Không tìm thấy bài giao');
    }
    const isTeacher = await this.isCourseManager(courseId, userId);
    if (!assignment.showLeaderboard && !isTeacher) {
      throw new ForbiddenException('Bảng xếp hạng của bài này đã bị ẩn');
    }
    const submissions = await this.prisma.assignmentSubmission.findMany({
      where: { assignmentId, published: true, score: { not: null } },
      orderBy: { score: 'desc' },
      include: { student: { select: { id: true, fullName: true } } },
      take: 50,
    });
    return submissions.map((s, i) => ({
      rank: i + 1,
      studentId: s.studentId,
      fullName: s.student.fullName,
      score: s.score,
      submittedAt: s.submittedAt,
    }));
  }

  // ============ EMAIL (GV bấm nút mới gửi) ============

  async notifyEmail(
    courseId: string,
    assignmentId: string,
    teacherId: string,
    body: any,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    await this.assertScope(courseId, assignmentId);
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      select: { title: true },
    });
    if (!assignment) throw new NotFoundException('Không tìm thấy bài giao');
    if (!this.mail.isConfigured()) {
      throw new ForbiddenException(
        'Email chưa được cấu hình trên hệ thống (thiếu SMTP)',
      );
    }

    // Lọc học sinh cần gửi: danh sách cụ thể hoặc toàn bộ đã đăng ký
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        courseId,
        ...(Array.isArray(body?.studentIds) && body.studentIds.length
          ? { studentId: { in: body.studentIds } }
          : {}),
      },
      include: { student: { select: { email: true, fullName: true } } },
    });
    const subject = body?.subject || `LumiMath: ${assignment.title}`;
    const html =
      body?.body ||
      `<p>Thông báo về bài tập <b>${assignment.title}</b> trong khóa học của bạn.</p>`;
    let sent = 0;
    for (const e of enrollments) {
      if (e.student.email && (await this.mail.send(e.student.email, subject, html))) {
        sent++;
      }
    }
    return { sent, total: enrollments.length };
  }
}
