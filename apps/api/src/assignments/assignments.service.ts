import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { MailService } from '../mail/mail.service';
import { GamificationService } from '../gamification/gamification.service';
import { ExamsService } from '../exams/exams.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private mail: MailService,
    private gamification: GamificationService,
    private exams: ExamsService,
  ) {}

  private async ensureTeacher(courseId: string, teacherId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu khóa học này');
    }
    return course;
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

    if (course.teacherId === userId) {
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
        return {
          ...a,
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
              }
            : null,
          showAnswers,
          isLate:
            a.dueDate && my
              ? new Date(my.submittedAt) > new Date(a.dueDate)
              : false,
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
    const assignment = await this.prisma.assignment.create({
      data: {
        courseId,
        teacherId,
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
    const data: any = {};
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
    if (body.revealAnswersAt !== undefined)
      data.revealAnswersAt = body.revealAnswersAt
        ? new Date(body.revealAnswersAt)
        : null;
    if (body.minScoreForAnswers !== undefined)
      data.minScoreForAnswers =
        body.minScoreForAnswers === '' || body.minScoreForAnswers == null
          ? null
          : Number(body.minScoreForAnswers);
    return this.prisma.assignment.update({
      where: { id: assignmentId },
      data,
    });
  }

  async remove(courseId: string, assignmentId: string, teacherId: string) {
    await this.ensureTeacher(courseId, teacherId);
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
    const isTeacher = assignment.course.teacherId === userId;
    if (!isTeacher && role === 'STUDENT') {
      const en = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: userId } },
      });
      if (!en) throw new ForbiddenException('Chưa đăng ký khóa học');
    }

    if (isTeacher) {
      const submissions = await this.prisma.assignmentSubmission.findMany({
        where: { assignmentId },
        orderBy: { submittedAt: 'asc' },
        include: {
          student: { select: { id: true, fullName: true, studentCode: true } },
        },
      });
      const enrolled = await this.prisma.enrollment.findMany({
        where: { courseId },
        include: { student: { select: { id: true, fullName: true, studentCode: true } } },
        orderBy: { enrolledAt: 'asc' },
      });
      const submittedIds = new Set(submissions.map((s) => s.studentId));
      return {
        ...assignment,
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
    const showAnswers = this.showAnswersRule(assignment as any, mine);
    return {
      ...assignment,
      mySubmission: mine,
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
    if (
      existing &&
      !assignment.allowResubmit &&
      existing.status !== 'RETURNED'
    ) {
      throw new ForbiddenException(
        'Bạn đã nộp bài này rồi (chờ giáo viên yêu cầu nộp lại nếu cần sửa)',
      );
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

    // Thưởng XP nộp bài
    await this.gamification.awardXp(studentId, 15);

    // KHÔNG tự chấm AI nữa — giáo viên bấm nút "Chấm bằng AI" để chấm câu tự luận
    return submission;
  }

  // GV bấm nút → AI chấm các câu TỰ LUẬN (trắc nghiệm tính điểm tự động từ đáp án đã lưu)
  async aiGrade(
    courseId: string,
    assignmentId: string,
    submissionId: string,
    teacherId: string,
  ) {
    await this.ensureTeacher(courseId, teacherId);
    return this.runAiGrade(submissionId);
  }

  // HS làm đề thi qua giao diện THI ONLINE rồi bấm nộp kết quả vào bài giao
  async submitExamResult(
    courseId: string,
    assignmentId: string,
    studentId: string,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
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
      orderBy: { submittedAt: 'desc' },
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
      aiFeedback: 'Điểm do hệ thống thi online chấm (trắc nghiệm tự động + tự luận AI). Giáo viên chốt điểm cuối.',
      status: 'SUBMITTED',
      published: false,
      submittedAt: new Date(),
    };
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
      const promptText = [
        assignment.customContent,
        ...(assignment.customQuestions || []),
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
      data: { aiScore: score, aiFeedback },
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
    if (
      assignment?.dueDate &&
      assignment.lateDeductionPercent &&
      submission?.submittedAt &&
      data.score != null
    ) {
      const due = new Date(assignment.dueDate).getTime();
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
      assignment?.dueDate &&
      assignment.missingDeductionPercent &&
      !submission?.submittedAt &&
      data.score != null &&
      new Date(assignment.dueDate).getTime() < Date.now()
    ) {
      const base = Number(data.score);
      const final = Math.max(
        0,
        base - base * (assignment.missingDeductionPercent / 100),
      );
      data.score = Math.round(final * 100) / 100;
      data.penaltyPoints = Math.round((base - Number(data.score)) * 100) / 100;
    }

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
        },
      });
    }
    return { total: result.total, changed: result.changed, synced, scores: result.scores };
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
    const isTeacher = assignment.course.teacherId === userId;
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
