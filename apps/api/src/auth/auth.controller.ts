import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes, createHash } from 'crypto';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcryptjs';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  // Chống brute-force: tối đa 10 lần đăng ký/phút/IP
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Gửi mã OTP xác thực email khi đăng ký (học sinh)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('otp/send')
  sendOtp(@Body() body: { email?: string }) {
    return this.authService.sendOtp(body?.email || '');
  }

  // Chống brute-force: tối đa 10 lần đăng nhập/phút/IP
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: any) {
    // Trợ giảng thuần (chưa sở hữu khóa học nào) → chỉ thao tác trong khóa được add
    const owned = await this.prisma.course.count({ where: { teacherId: user.id } });
    const assisted = await this.prisma.courseAssistant.count({
      where: { userId: user.id },
    });
    return { ...user, assistantOnly: owned === 0 && assisted > 0 };
  }

  // ============ HỒ SƠ CÁ NHÂN (trang Cài đặt) ============

  private static readonly PROFILE_SELECT = {
    id: true,
    email: true,
    role: true,
    fullName: true,
    avatarUrl: true,
    school: true,
    className: true,
    grade: true,
    workplace: true,
    birthDate: true,
    phone: true,
    parentPhone: true,
    teacherCode: true,
    studentCode: true,
    xp: true,
    level: true,
    streakDays: true,
    emailNotify: true,
  } as const;

  // Lấy hồ sơ đầy đủ của chính mình
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return this.prisma.user.findUnique({
      where: { id: user.id },
      select: AuthController.PROFILE_SELECT,
    });
  }

  // Tự sửa hồ sơ: chỉ sửa được tài khoản của chính mình.
  // Email, vai trò, mã HS/GV, XP… KHÔNG sửa được qua đây.
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(@CurrentUser() user: any, @Body() body: any) {
    const b = body || {};
    const data: Record<string, any> = {};

    const text = (v: any, max: number, label: string) => {
      if (v === null) return null;
      const s = String(v ?? '').trim();
      if (s.length > max) {
        throw new BadRequestException(`${label} dài quá ${max} ký tự`);
      }
      return s === '' ? null : s;
    };

    if (b.fullName !== undefined) {
      const name = text(b.fullName, 80, 'Họ và tên');
      if (!name || name.length < 2) {
        throw new BadRequestException('Họ và tên phải có ít nhất 2 ký tự');
      }
      data.fullName = name;
    }
    if (b.className !== undefined) data.className = text(b.className, 20, 'Lớp');
    if (b.school !== undefined) data.school = text(b.school, 120, 'Trường');
    if (b.workplace !== undefined) data.workplace = text(b.workplace, 120, 'Nơi công tác');
    if (b.grade !== undefined) {
      if (b.grade === null || b.grade === '') data.grade = null;
      else {
        const g = Number(b.grade);
        if (!Number.isInteger(g) || g < 1 || g > 12) {
          throw new BadRequestException('Khối lớp không hợp lệ');
        }
        data.grade = g;
      }
    }
    const phoneOk = (v: string | null) =>
      v === null || /^[0-9+ .-]{8,20}$/.test(v);
    if (b.phone !== undefined) {
      const v = text(b.phone, 20, 'Số điện thoại');
      if (!phoneOk(v)) throw new BadRequestException('Số điện thoại không hợp lệ');
      data.phone = v;
    }
    if (b.parentPhone !== undefined) {
      const v = text(b.parentPhone, 20, 'Số điện thoại phụ huynh');
      if (!phoneOk(v)) {
        throw new BadRequestException('Số điện thoại phụ huynh không hợp lệ');
      }
      data.parentPhone = v;
    }
    if (b.birthDate !== undefined) {
      if (b.birthDate === null || b.birthDate === '') data.birthDate = null;
      else {
        const d = new Date(b.birthDate);
        const year = d.getFullYear();
        if (isNaN(d.getTime()) || year < 1940 || d > new Date()) {
          throw new BadRequestException('Ngày sinh không hợp lệ');
        }
        data.birthDate = d;
      }
    }
    if (b.avatarUrl !== undefined) {
      const v = text(b.avatarUrl, 500, 'Ảnh đại diện');
      // Chỉ nhận ảnh đã tải lên qua /uploads của chính web
      if (v !== null && !/^(\/api)?\/uploads\/[\w.-]+$/.test(v)) {
        throw new BadRequestException('Ảnh đại diện không hợp lệ');
      }
      data.avatarUrl = v;
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data,
      select: AuthController.PROFILE_SELECT,
    });
  }

  // ============ QUÊN MẬT KHẨU (email thật) ============

  // Gửi link đặt lại mật khẩu qua email
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email?: string }) {
    const email = (body?.email || '').trim().toLowerCase();
    if (!email) return { ok: true, sent: false };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { ok: true, sent: false }; // không tiết lộ email tồn tại

    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: createHash('sha256').update(token).digest('hex'),
        resetExpires: new Date(Date.now() + 30 * 60000),
      },
    });

    const webUrl =
      (process.env.WEB_URL || 'http://localhost:3000').replace(/\/$/, '');
    const link = `${webUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;
    const sent = await this.mail.sendPasswordReset(email, link);

    return { ok: true, sent, message: sent ? '' : 'SMTP chưa được cấu hình' };
  }

  // Đặt lại mật khẩu bằng token
  @Post('reset-password')
  async resetPassword(
    @Body() body: { email?: string; token?: string; newPassword?: string },
  ) {
    const email = (body?.email || '').trim().toLowerCase();
    const token = body?.token || '';
    const newPassword = body?.newPassword || '';
    if (!email || !token) throw new ForbiddenException('Thiếu thông tin');
    if (newPassword.length < 6) {
      throw new ForbiddenException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.resetToken || !user.resetExpires) {
      throw new ForbiddenException('Liên kết không hợp lệ hoặc đã hết hạn');
    }
    if (new Date(user.resetExpires) < new Date()) {
      throw new ForbiddenException('Liên kết đã hết hạn, vui lòng yêu cầu lại');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    if (hash !== user.resetToken) {
      throw new ForbiddenException('Liên kết không hợp lệ');
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        resetToken: null,
        resetExpires: null,
      },
    });
    return { ok: true };
  }

  // Bật/tắt nhận thông báo qua email
  @UseGuards(JwtAuthGuard)
  @Post('email-notify')
  async toggleEmailNotify(
    @CurrentUser() user: any,
    @Body() body: { enabled?: boolean },
  ) {
    const enabled = body?.enabled !== false;
    const me = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailNotify: enabled },
      select: { emailNotify: true },
    });
    return { emailNotify: me.emailNotify };
  }

  // Đổi mật khẩu của chính mình (cả GV và HS)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: any,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const newPassword = body?.newPassword || '';
    if (newPassword.length < 6) {
      throw new ForbiddenException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }
    const me = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!me) throw new ForbiddenException('Không tìm thấy tài khoản');
    const ok = await bcrypt.compare(body?.currentPassword || '', me.passwordHash);
    if (!ok) throw new ForbiddenException('Mật khẩu hiện tại không đúng');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });
    return { ok: true };
  }

  // Giáo viên đặt lại mật khẩu cho học sinh
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('reset-student-password')
  async resetStudentPassword(
    @Body() body: { studentId?: string; newPassword?: string },
  ) {
    const newPassword = body?.newPassword || '';
    if (newPassword.length < 6) {
      throw new ForbiddenException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }
    const student = await this.prisma.user.findFirst({
      where: { id: body?.studentId, role: Role.STUDENT },
    });
    if (!student) throw new ForbiddenException('Không tìm thấy học sinh');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: student.id },
      data: { passwordHash: hash },
    });
    // Gửi email mật khẩu mới cho học sinh (nếu SMTP đã cấu hình)
    await this.mail.sendNewPassword(student.email, student.fullName, newPassword);
    return { ok: true, email: student.email };
  }
}
