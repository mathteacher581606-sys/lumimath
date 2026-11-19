import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Tóm tắt việc chấm bài cho trang chủ giáo viên:
 * - pending: bài học sinh đã nộp, GV chưa chấm (status SUBMITTED)
 * - unpublished: đã chấm nhưng chưa công bố điểm cho HS
 * Chỉ tính các khóa mà người này là chủ hoặc trợ giảng.
 */
@Controller('teacher')
export class GradingSummaryController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('grading-summary')
  async summary(@CurrentUser() user: any) {
    const courses = await this.prisma.course.findMany({
      where: {
        OR: [{ teacherId: user.id }, { assistants: { some: { userId: user.id } } }],
      },
      select: { id: true, title: true },
    });
    const courseIds = courses.map((c) => c.id);
    if (!courseIds.length) {
      return { totalPending: 0, totalUnpublished: 0, items: [] };
    }
    const courseTitle = new Map(courses.map((c) => [c.id, c.title]));

    // Đếm theo bài giao bằng groupBy (1 truy vấn, không tải nội dung bài nộp)
    const [pendingGroups, unpublishedGroups] = await Promise.all([
      this.prisma.assignmentSubmission.groupBy({
        by: ['assignmentId'],
        where: { status: 'SUBMITTED', assignment: { courseId: { in: courseIds } } },
        _count: { _all: true },
        _min: { submittedAt: true },
      }),
      this.prisma.assignmentSubmission.groupBy({
        by: ['assignmentId'],
        where: {
          status: { not: 'SUBMITTED' },
          published: false,
          assignment: { courseId: { in: courseIds } },
        },
        _count: { _all: true },
      }),
    ]);

    const ids = Array.from(
      new Set([...pendingGroups, ...unpublishedGroups].map((g) => g.assignmentId)),
    );
    const assignments = ids.length
      ? await this.prisma.assignment.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, courseId: true, dueDate: true },
        })
      : [];
    const byId = new Map(assignments.map((a) => [a.id, a]));
    const unpub = new Map(unpublishedGroups.map((g) => [g.assignmentId, g._count._all]));
    const pend = new Map(pendingGroups.map((g) => [g.assignmentId, g]));

    const items = ids
      .map((id) => {
        const a = byId.get(id);
        if (!a) return null;
        const p = pend.get(id);
        return {
          assignmentId: id,
          courseId: a.courseId,
          courseTitle: courseTitle.get(a.courseId) || '',
          title: a.title,
          dueDate: a.dueDate,
          pending: p?._count._all ?? 0,
          oldestSubmittedAt: p?._min.submittedAt ?? null,
          unpublished: unpub.get(id) ?? 0,
        };
      })
      .filter(Boolean) as any[];

    // Bài chờ lâu nhất lên trước, sau đó tới bài chỉ còn chờ công bố điểm
    items.sort((x, y) => {
      if (!!y.pending !== !!x.pending) return y.pending ? 1 : -1;
      const tx = x.oldestSubmittedAt ? new Date(x.oldestSubmittedAt).getTime() : Infinity;
      const ty = y.oldestSubmittedAt ? new Date(y.oldestSubmittedAt).getTime() : Infinity;
      return tx - ty || y.unpublished - x.unpublished;
    });

    return {
      totalPending: items.reduce((s, i) => s + i.pending, 0),
      totalUnpublished: items.reduce((s, i) => s + i.unpublished, 0),
      items: items.slice(0, 8),
    };
  }
}
