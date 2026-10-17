import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { GamificationService } from './gamification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  // Bảng xếp hạng theo XP
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('leaderboard')
  leaderboard(@Query('school') school?: string) {
    return this.gamification.leaderboard(school);
  }

  // Thành tích của tôi
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('achievements')
  achievements(@CurrentUser() user: any) {
    return this.gamification.myAchievements(user.id);
  }

  // Nhiệm vụ hằng ngày (tự thưởng XP khi hoàn thành)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Get('daily-quests')
  dailyQuests(@CurrentUser() user: any) {
    return this.gamification.dailyQuests(user.id);
  }
}
