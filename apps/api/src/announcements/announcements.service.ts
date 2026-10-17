import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private gamification: GamificationService,
  ) {}

  private async ensureAccess(courseId: string, userId: string, role: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    const isOwner = course.teacherId === userId;
    if (!isOwner && role === 'STUDENT') {
      const en = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: userId } },
      });
      if (!en) throw new ForbiddenException('Chưa đăng ký khóa học');
    }
    return isOwner;
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
        comments: { orderBy: { createdAt: 'asc' }, take: 50 },
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
        comments: a.comments,
        reactions: a.reactions,
        votes: a.votes,
        commentCount: a.comments.length,
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

  async create(courseId: string, teacherId: string, body: any) {
    await this.ensureAccess(courseId, teacherId, 'TEACHER');
    const ann = await this.prisma.announcement.create({
      data: {
        courseId,
        teacherId,
        content: String(body?.content || '').trim(),
        images: Array.isArray(body?.images) ? body.images.slice(0, 20) : [],
        pinned: !!body?.pinned,
        allowVote: !!body?.allowVote,
        voteOptions: Array.isArray(body?.voteOptions)
          ? body.voteOptions.slice(0, 10).map(String)
          : [],
        voteDeadline: body?.voteDeadline ? new Date(body.voteDeadline) : null,
      },
    });
    this.notifyAll(
      courseId,
      teacherId,
      '📣 Thông báo mới từ khóa học',
      (body?.content || '').slice(0, 120),
      `/student/courses/${courseId}?tab=announcements`,
    );
    return ann;
  }

  async update(
    courseId: string,
    announcementId: string,
    teacherId: string,
    body: any,
  ) {
    await this.ensureAccess(courseId, teacherId, 'TEACHER');
    return this.prisma.announcement.update({
      where: { id: announcementId },
      data: {
        content: body?.content,
        images: body?.images,
        pinned: body?.pinned,
        allowVote: body?.allowVote,
        voteOptions: body?.voteOptions,
        voteDeadline: body?.voteDeadline
          ? new Date(body.voteDeadline)
          : undefined,
      },
    });
  }

  async remove(courseId: string, announcementId: string, teacherId: string) {
    await this.ensureAccess(courseId, teacherId, 'TEACHER');
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
    if (!String(content || '').trim()) {
      throw new ForbiddenException('Nội dung bình luận trống');
    }
    return this.prisma.announcementComment.create({
      data: { announcementId, authorId: userId, content },
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
    const ann = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { voteOptions: true, voteDeadline: true },
    });
    if (!ann || !ann.voteOptions.length) {
      throw new ForbiddenException('Bài đăng không có biểu quyết');
    }
    if (
      ann.voteDeadline &&
      new Date(ann.voteDeadline).getTime() < Date.now()
    ) {
      throw new ForbiddenException('Biểu quyết đã hết hạn');
    }
    if (optionIndex < 0 || optionIndex >= ann.voteOptions.length) {
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
