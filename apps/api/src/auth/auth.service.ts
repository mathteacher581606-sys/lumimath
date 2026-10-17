import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
  ) {}

  private randomCode(prefix: 'GV' | 'HS'): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${n}`;
  }

  private hashOtp(code: string): string {
    return createHash('sha256').update(String(code)).digest('hex');
  }

  // ===== OTP XÁC THỰC EMAIL =====

  // Gửi mã OTP 6 số tới email (chống spam 60s/lần, tối đa 20 mã/ngày/email)
  async sendOtp(rawEmail: string) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Email không hợp lệ');
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(
        'Email này đã có tài khoản — hãy đăng nhập hoặc dùng email khác',
      );
    }
    const last = await this.prisma.otpCode.findFirst({
      where: { email, purpose: 'REGISTER' },
      orderBy: { createdAt: 'desc' },
    });
    if (last && Date.now() - new Date(last.createdAt).getTime() < 60000) {
      throw new HttpException(
        'Vui lòng chờ 60 giây trước khi gửi lại mã',
        429,
      );
    }
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const todayCount = await this.prisma.otpCode.count({
      where: { email, createdAt: { gte: since } },
    });
    if (todayCount >= 20) {
      throw new HttpException('Đã gửi quá nhiều mã trong hôm nay, thử lại sau', 429);
    }

    const code = String(randomInt(100000, 1000000));
    await this.prisma.otpCode.create({
      data: {
        email,
        codeHash: this.hashOtp(code),
        purpose: 'REGISTER',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    const sent = await this.mail.sendOtp(email, code);
    if (!sent) {
      throw new HttpException(
        'Chưa gửi được email (SMTP chưa cấu hình hoặc bị chặn) — vui lòng thử lại sau',
        503,
      );
    }
    return { ok: true, expiresInSec: 300 };
  }

  // Kiểm tra mã OTP: đúng → đánh dấu đã dùng; sai → tăng số lần thử
  async verifyOtp(rawEmail: string, rawCode: string): Promise<boolean> {
    const email = String(rawEmail || '').trim().toLowerCase();
    const code = String(rawCode || '').trim();
    const rec = await this.prisma.otpCode.findFirst({
      where: {
        email,
        purpose: 'REGISTER',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!rec) {
      throw new BadRequestException(
        'Mã xác nhận đã hết hạn hoặc chưa được gửi — hãy bấm "Gửi mã" lại',
      );
    }
    if (rec.attempts >= 5) {
      throw new BadRequestException(
        'Nhập sai quá 5 lần — hãy gửi lại mã mới',
      );
    }
    if (rec.codeHash !== this.hashOtp(code)) {
      await this.prisma.otpCode.update({
        where: { id: rec.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Mã xác nhận không đúng');
    }
    await this.prisma.otpCode.update({
      where: { id: rec.id },
      data: { usedAt: new Date() },
    });
    return true;
  }

  async register(dto: RegisterDto) {
    // Chặn đăng ký ADMIN qua API công khai (admin chỉ được seed/đổi trực tiếp)
    if (dto.role === Role.ADMIN) {
      throw new ForbiddenException('Không thể đăng ký tài khoản ADMIN');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email đã tồn tại');
    }

    // HỌC SINH phải xác thực email bằng OTP (tắt bằng REQUIRE_STUDENT_OTP=false)
    const otpRequired =
      dto.role === Role.STUDENT && process.env.REQUIRE_STUDENT_OTP !== 'false';
    if (otpRequired) {
      if (!dto.otp) {
        throw new BadRequestException(
          'Vui lòng nhập mã xác nhận email (OTP) để đăng ký',
        );
      }
      await this.verifyOtp(dto.email, dto.otp);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const isTeacher = dto.role === Role.TEACHER;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: dto.role,
        fullName: dto.fullName,
        school: dto.school,
        className: dto.className,
        workplace: dto.workplace,
        teacherCode: isTeacher ? this.randomCode('GV') : undefined,
        studentCode: isTeacher ? undefined : this.randomCode('HS'),
        ...(isTeacher
          ? {
              questionBank: {
                create: { name: 'Ngân hàng mặc định' },
              },
            }
          : {}),
      },
    });

    // Email chào mừng (nếu SMTP đã cấu hình)
    this.mail
      .sendWelcome(
        user.email,
        user.fullName,
        isTeacher ? 'Giáo viên' : 'Học sinh',
        user.teacherCode || user.studentCode || '—',
      )
      .catch(() => {});

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        teacherCode: user.teacherCode,
        studentCode: user.studentCode,
        school: user.school,
        className: user.className,
        workplace: user.workplace,
        xp: user.xp,
        level: user.level,
      },
    };
  }
}
