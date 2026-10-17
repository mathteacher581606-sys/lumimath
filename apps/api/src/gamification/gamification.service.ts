import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const ACHIEVEMENT_DEFS = [
  {
    code: 'FIRST_EXAM',
    name: 'Lần đầu thử sức',
    icon: '📝',
    desc: 'Hoàn thành bài thi đầu tiên',
  },
  {
    code: 'PERFECT_SCORE',
    name: 'Điểm tuyệt đối',
    icon: '💯',
    desc: 'Đạt điểm tối đa trong một bài thi',
  },
  {
    code: 'EXAM_5',
    name: 'Chăm chỉ',
    icon: '📚',
    desc: 'Hoàn thành 5 bài thi',
  },
  {
    code: 'EXAM_10',
    name: 'Bền bỉ',
    icon: '🏅',
    desc: 'Hoàn thành 10 bài thi',
  },
  {
    code: 'LEVEL_5',
    name: 'Lên level 5',
    icon: '⭐',
    desc: 'Đạt level 5',
  },
  {
    code: 'LEVEL_10',
    name: 'Cao thủ',
    icon: '🌟',
    desc: 'Đạt level 10',
  },
];

@Injectable()
export class GamificationService {
  constructor(private prisma: PrismaService) {}

  levelForXp(xp: number): number {
    return Math.floor(xp / 100) + 1;
  }

  // Cộng XP đơn giản (hoạt động khác: nộp bài tập, xem bài giảng...)
  async awardXp(studentId: string, amount: number) {    const user = await this.prisma.user.update({
      where: { id: studentId },
      data: { xp: { increment: amount }, lastActiveAt: new Date() },
    });
    const newLevel = this.levelForXp(user.xp);
    if (newLevel > user.level) {
      await this.prisma.user.update({
        where: { id: studentId },
        data: { level: newLevel },
      });
      await this.prisma.notification.create({
        data: {
          userId: studentId,
          title: `🎉 Lên level ${newLevel}!`,
          body: `Bạn đã đạt ${user.xp} XP. Tiếp tục phát huy!`,
          link: '/student/leaderboard',
        },
      });
    }
    return {
      xpEarned: amount,
      xp: user.xp,
      level: newLevel > user.level ? newLevel : user.level,
      leveledUp: newLevel > user.level,
      newLevel,
    };
  }

  // Gọi sau khi học sinh nộp bài thi → cộng XP, level, kiểm tra thành tích
  async processExamResult(
    studentId: string,
    score: number,
    totalScore: number,
  ) {
    const xpEarned = Math.max(10, Math.round(score * 10));

    const user = await this.prisma.user.update({
      where: { id: studentId },
      data: { xp: { increment: xpEarned }, lastActiveAt: new Date() },
    });

    const newLevel = this.levelForXp(user.xp);
    const leveledUp = newLevel > user.level;

    const attemptCount = await this.prisma.examAttempt.count({
      where: { studentId, submittedAt: { not: null } },
    });

    // Xác định thành tích đủ điều kiện
    const candidates: string[] = [];
    if (attemptCount === 1) candidates.push('FIRST_EXAM');
    if (totalScore > 0 && score >= totalScore) candidates.push('PERFECT_SCORE');
    if (attemptCount >= 5) candidates.push('EXAM_5');
    if (attemptCount >= 10) candidates.push('EXAM_10');
    if (newLevel >= 5) candidates.push('LEVEL_5');
    if (newLevel >= 10) candidates.push('LEVEL_10');

    const newAchievements: any[] = [];

    for (const code of candidates) {
      const def = ACHIEVEMENT_DEFS.find((a) => a.code === code);
      if (!def) continue;
      const exists = await this.prisma.achievement.findUnique({
        where: { userId_code: { userId: studentId, code } },
      });
      if (exists) continue;
      await this.prisma.achievement.create({
        data: { userId: studentId, code, name: def.name, icon: def.icon },
      });
      await this.prisma.notification.create({
        data: {
          userId: studentId,
          title: `${def.icon} Thành tích mới: ${def.name}`,
          body: def.desc,
          link: '/student/leaderboard',
        },
      });
      newAchievements.push(def);
    }

    if (leveledUp) {
      await this.prisma.user.update({
        where: { id: studentId },
        data: { level: newLevel },
      });
      await this.prisma.notification.create({
        data: {
          userId: studentId,
          title: `🎉 Lên level ${newLevel}!`,
          body: `Bạn đã đạt ${user.xp} XP. Tiếp tục phát huy!`,
          link: '/student/leaderboard',
        },
      });
    }

    return {
      xpEarned,
      xp: user.xp,
      level: leveledUp ? newLevel : user.level,
      leveledUp,
      newLevel,
      newAchievements,
    };
  }

  async leaderboard(school?: string) {
    const where: any = { role: 'STUDENT', isActive: true };
    if (school) where.school = school;

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        school: true,
        className: true,
        xp: true,
        level: true,
        streakDays: true,
      },
      orderBy: { xp: 'desc' },
      take: 50,
    });

    return users.map((u, i) => ({ rank: i + 1, ...u }));
  }

  async myAchievements(userId: string) {
    const earned = await this.prisma.achievement.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    });

    const earnedCodes = new Set(earned.map((e) => e.code));
    const all = ACHIEVEMENT_DEFS.map((a) => ({
      ...a,
      earned: earnedCodes.has(a.code),
      earnedAt: earned.find((e) => e.code === a.code)?.earnedAt ?? null,
    }));

    return { earned, all };
  }

  // ============ NHIỆM VỤ HẰNG NGÀY ============

  // Tính + tự thưởng XP cho nhiệm vụ hằng ngày (lười thưởng khi xem)
  async dailyQuests(studentId: string) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [user, attemptsToday, lessonsToday, claimedRows] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: studentId } }),
      this.prisma.examAttempt.count({
        where: { studentId, submittedAt: { gte: startOfDay } },
      }),
      this.prisma.lessonProgress.count({
        where: {
          studentId,
          completed: true,
          updatedAt: { gte: startOfDay },
        },
      }),
      this.prisma.dailyQuest.findMany({
        where: { studentId, date: today },
      }),
    ]);
    if (!user) throw new NotFoundException('Không tìm thấy học sinh');

    const claimed = new Set(claimedRows.map((c) => c.questKey));
    const quests = [
      {
        key: 'exam',
        icon: '📝',
        label: 'Làm 1 bài thi',
        bonus: 20,
        done: attemptsToday >= 1,
      },
      {
        key: 'lesson',
        icon: '📚',
        label: 'Hoàn thành 1 bài giảng',
        bonus: 15,
        done: lessonsToday >= 1,
      },
      {
        key: 'streak3',
        icon: '🔥',
        label: 'Chuỗi 3 ngày học liên tiếp',
        bonus: 30,
        done: (user.streakDays ?? 0) >= 3,
      },
    ];

    let bonusToday = 0;
    for (const q of quests) {
      if (q.done && !claimed.has(q.key)) {
        // Thưởng XP 1 lần duy nhất trong ngày
        try {
          await this.prisma.dailyQuest.create({
            data: { studentId, questKey: q.key, date: today },
          });
          await this.awardXp(studentId, q.bonus);
          bonusToday += q.bonus;
        } catch (e) {
          /* trùng khóa — bỏ qua */
        }
      }
    }

    return {
      date: today,
      quests: quests.map((q) => ({ ...q, claimed: claimed.has(q.key) })),
      bonusToday,
      streakDays: user.streakDays ?? 0,
    };
  }
}
