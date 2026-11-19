import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

const CONTENT_MAX = 10000;
const COMMENT_MAX = 2000;
const COMMENT_LIMIT = 100;

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
  ) {}

  /**
   * Quyền truy cập Bảng tin của 1 khóa học:
   * - Chủ khóa hoặc trợ giảng (CourseAssistant): quản lý (đăng/sửa/xoá) + tương tác.
   * - Học sinh đã đăng ký: xem + bình luận / cảm xúc / biểu quyết.
   * - Còn lại (kể cả giáo viên khác): bị chặn.
   * Trả về true nếu người này được quản lý.
   */
  private async ensureAccess(courseId: string, userId: string, role: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId === userId) return true;
    if (role === 'TEACHER' || role === 'ADMIN') {
      const assistant = await this.prisma.courseAssistant.findUnique({
        where: { courseId_userId: { courseId, userId } },
      });
      if (assistant) return true;
      throw new ForbiddenException('Bạn không quản lý khóa học này');
    }
    const en = await this.prisma.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: userId } },
    });
    if (!en) throw new ForbiddenException('Chưa đăng ký khóa học');
    return false;
  }

  private async ensureManager(courseId: string, userId: string, role: string) {
    const canManage = await this.ensureAccess(courseId, userId, role);
    if (!canManage) throw new ForbiddenException('Chỉ giáo viên của khóa học được làm việc này');
  }

  // Bài đăng phải thuộc đúng khóa học trên URL (chống sửa/xoá bài của khóa khác)
  private async ensureInCourse(courseId: string, announcementId: string) {
    const ann = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true, courseId: true, voteOptions: true, voteDeadline: true },
    });
    if (!ann || ann.courseId !== courseId) {
      throw new NotFoundException('Không tìm thấy bài đăng');
    }
    return ann;
  }

  // Thông báo in-app cho toàn bộ học sinh đã đăng ký khóa học
  private async notifyAll(
    courseId: string,
    exceptUserId: string,
    title: string,
    body: string,
    link: string,
  ) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId, studentId: { not: exceptUserId } },
      select: { studentId: true },
    });
    await this.prisma.notification.createMany({
      data: enrollments.map((e) => ({
        userId: e.studentId,
        title,
        body,
        link,
      })),
    });
  }

  async list(courseId: string, userId: string, role: string) {
    await this.ensureAccess(courseId, userId, role);
    const list = await this.prisma.announcement.findMany({
      where: { courseId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      include: {
        comments: { orderBy: { createdAt: 'desc' }, take: COMMENT_LIMIT },
        _count: { select: { comments: true } },
        reactions: true,
        votes: true,
      },
    });
    return list.map((a) => {
      const reactionCounts: Record<string, number> = {};
      for (const r of a.reactions) {
        reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
      }
      return {
        ...a,
        // Lấy 100 bình luận mới nhất rồi trả lại theo thứ tự cũ → mới
        comments: [...a.comments].reverse(),
        reactions: a.reactions,
        votes: a.votes,
        commentCount: a._count.comments,
        reactionCounts,
        voteCounts: (a.voteOptions || []).map(
          (_, i) => a.votes.filter((v) => v.optionIndex === i).length,
        ),
        myReaction:
          a.reactions.find((r) => r.userId === userId)?.emoji ?? null,
        myVote: a.votes.find((v) => v.userId === userId)?.optionIndex ?? null,
      };
    });
  }

  async create(courseId: string, teacherId: string, body: any, role = 'TEACHER') {
    await this.ensureManager(courseId, teacherId, role);
    const content = String(body?.content || '').trim();
    if (!content && !(Array.isArray(body?.images) && body.images.length)) {
      throw new BadRequestException('Bài đăng cần có nội dung hoặc ảnh');
    }
    if (content.length > CONTENT_MAX) {
      throw new BadRequestException(`Bài đăng dài quá ${CONTENT_MAX} ký tự`);
    }
    const ann = await this.prisma.announcement.create({
      data: {
        courseId,
        teacherId,
        content,
        images: Array.isArray(body?.images) ? body.images.slice(0, 20).map(String) : [],
        pinned: !!body?.pinned,
        allowVote: !!body?.allowVote,
        voteOptions: Array.isArray(body?.voteOptions)
          ? body.voteOptions.slice(0, 10).map(String)
          : [],
        voteDeadline: body?.voteDeadline ? new Date(body.voteDeadline) : null,
      },
    });
    // Gửi thông báo chạy nền; lỗi ở đây không được làm sập tiến trình API
    this.notifyAll(
      courseId,
      teacherId,
      '📣 Thông báo mới từ khóa học',
      content.slice(0, 120),
      `/student/courses/${courseId}?tab=announcements`,
    ).catch((e) => console.error('[announcements] notifyAll lỗi:', e?.message || e));
    return ann;
  }

  async update(
    courseId: string,
    announcementId: string,
    teacherId: string,
    body: any,
    role = 'TEACHER',
  ) {
    await this.ensureManager(courseId, teacherId, role);
    await this.ensureInCourse(courseId, announcementId);
    if (typeof body?.content === 'string' && body.content.length > CONTENT_MAX) {
      throw new BadRequestException(`Bài đăng dài quá ${CONTENT_MAX} ký tự`);
    }
    return this.prisma.announcement.update({
      where: { id: announcementId },
      data: {
        content: typeof body?.content === 'string' ? body.content.trim() : undefined,
        images: Array.isArray(body?.images) ? body.images.slice(0, 20).map(String) : undefined,
        pinned: typeof body?.pinned === 'boolean' ? body.pinned : undefined,
        allowVote: typeof body?.allowVote === 'boolean' ? body.allowVote : undefined,
        voteOptions: Array.isArray(body?.voteOptions)
          ? body.voteOptions.slice(0, 10).map(String)
          : undefined,
        voteDeadline: body?.voteDeadline
          ? new Date(body.voteDeadline)
          : undefined,
      },
    });
  }

  async remove(courseId: string, announcementId: string, teacherId: string, role = 'TEACHER') {
    await this.ensureManager(courseId, teacherId, role);
    await this.ensureInCourse(courseId, announcementId);
    await this.prisma.announcement.delete({
      where: { id: announcementId },
    });
    return { deleted: true };
  }

  async comment(
    courseId: string,
    announcementId: string,
    userId: string,
    role: string,
    content: string,
  ) {
    await this.ensureAccess(courseId, userId, role);
    await this.ensureInCourse(courseId, announcementId);
    const text = String(content || '').trim();
    if (!text) throw new BadRequestException('Nội dung bình luận trống');
    if (text.length > COMMENT_MAX) {
      throw new BadRequestException(`Bình luận dài quá ${COMMENT_MAX} ký tự`);
    }
    return this.prisma.announcementComment.create({
      data: { announcementId, authorId: userId, content: text },
    });
  }

  async react(
    courseId: string,
    announcementId: string,
    userId: string,
    role: string,
    emoji: string,
  ) {
    await this.ensureAccess(courseId, userId, role);
    await this.ensureInCourse(courseId, announcementId);
    emoji = String(emoji || '').slice(0, 16);
    if (!emoji) throw new BadRequestException('Thiếu biểu tượng cảm xúc');
    const current = await this.prisma.announcementReaction.findUnique({
      where: { announcementId_userId: { announcementId, userId } },
    });
    if (current && current.emoji === emoji) {
      await this.prisma.announcementReaction.delete({
        where: { announcementId_userId: { announcementId, userId } },
      });
      return { emoji: null };
    }
    await this.prisma.announcementReaction.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: { emoji },
      create: { announcementId, userId, emoji },
    });
    return { emoji };
  }

  async vote(
    courseId: string,
    announcementId: string,
    userId: string,
    role: string,
    optionIndex: number,
  ) {
    await this.ensureAccess(courseId, userId, role);
    const ann = await this.ensureInCourse(courseId, announcementId);
    optionIndex = Number(optionIndex);
    if (!ann.voteOptions.length) {
      throw new ForbiddenException('Bài đăng không có biểu quyết');
    }
    if (
      ann.voteDeadline &&
      new Date(ann.voteDeadline).getTime() < Date.now()
    ) {
      throw new ForbiddenException('Biểu quyết đã hết hạn');
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= ann.voteOptions.length) {
      throw new ForbiddenException('Lựa chọn không hợp lệ');
    }
    await this.prisma.announcementVote.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: { optionIndex },
      create: { announcementId, userId, optionIndex },
    });
    return { ok: true };
  }
}
