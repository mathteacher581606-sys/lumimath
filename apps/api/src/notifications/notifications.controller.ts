import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  // Danh sách thông báo + số chưa đọc
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  async list(@CurrentUser() user: any) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({
        where: { userId: user.id, isRead: false },
      }),
    ]);
    return { items, unread };
  }

  // Đánh dấu 1 thông báo đã đọc
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/read')
  async markRead(@CurrentUser() user: any, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { isRead: true },
    });
    return { ok: true };
  }

  // Đánh dấu tất cả đã đọc
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('read-all')
  async markAllRead(@CurrentUser() user: any) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    return { ok: true };
  }
}
