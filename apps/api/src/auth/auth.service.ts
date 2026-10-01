import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private randomCode(prefix: 'GV' | 'HS'): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${n}`;
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email đã tồn tại');
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
