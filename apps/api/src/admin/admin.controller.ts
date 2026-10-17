import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
  ADMIN: 'Quản trị',
};

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private prisma: PrismaService) {}

  // Thống kê tổng quan
  @Get('stats')
  async stats() {
    const [teachers, students, courses, questions, exams, attempts] =
      await Promise.all([
        this.prisma.user.count({ where: { role: Role.TEACHER } }),
        this.prisma.user.count({ where: { role: Role.STUDENT } }),
        this.prisma.course.count(),
        this.prisma.question.count(),
        this.prisma.exam.count(),
        this.prisma.examAttempt.count({ where: { submittedAt: { not: null } } }),
      ]);
    return { teachers, students, courses, questions, exams, attempts };
  }

  // Danh sách thành viên (lọc theo vai trò / tìm kiếm)
  @Get('users')
  async users(
    @Query('role') role?: string,
    @Query('q') q?: string,
  ) {
    const where: any = {};
    if (role === 'TEACHER' || role === 'STUDENT') where.role = role;
    if (q && q.trim()) {
      const kw = q.trim();
      where.OR = [
        { email: { contains: kw } },
        { fullName: { contains: kw } },
        { teacherCode: { contains: kw } },
        { studentCode: { contains: kw } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        teacherCode: true,
        studentCode: true,
        school: true,
        className: true,
        workplace: true,
        xp: true,
        level: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return users.map((u) => ({
      ...u,
      roleLabel: ROLE_LABEL[u.role] || u.role,
    }));
  }

  // Sửa thông tin thành viên
  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy thành viên');

    const data: any = {};
    if (typeof body.fullName === 'string' && body.fullName.trim()) {
      data.fullName = body.fullName.trim();
    }
    if (typeof body.email === 'string' && body.email.trim()) {
      const email = body.email.trim();
      const dup = await this.prisma.user.findFirst({
        where: { email, id: { not: id } },
      });
      if (dup) throw new ForbiddenException('Email đã được sử dụng bởi tài khoản khác');
      data.email = email;
    }
    if (typeof body.school === 'string') data.school = body.school;
    if (typeof body.className === 'string') data.className = body.className;
    if (typeof body.workplace === 'string') data.workplace = body.workplace;

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        school: true,
        className: true,
        workplace: true,
      },
    });
  }

  // Đặt lại mật khẩu
  @Post('users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { newPassword?: string },
  ) {
    const newPassword = body?.newPassword || '';
    if (newPassword.length < 6) {
      throw new ForbiddenException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy thành viên');
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: hash } });
    return { ok: true };
  }

  // Xóa tài khoản
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @CurrentUser() me: any) {
    if (id === me.id) {
      throw new ForbiddenException('Không thể tự xóa tài khoản của chính mình');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Không tìm thấy thành viên');
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }

  // ============ NHẬP HỌC SINH HÀNG LOẠT TỪ EXCEL ============

  private randomStudentCode(): string {
    return `HS-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private randomPassword(): string {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  private normalizeHeader(h: string): string {
    return String(h || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '');
  }

  // Nhận file Excel (.xlsx) → tạo tài khoản học sinh hàng loạt
  @Post('import-students')
  async importStudents(@Req() req: any, @Res() res: Response) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) {
      return res.status(400).json({ message: 'Không có file Excel' });
    }

    let rows: Record<string, any>[];
    try {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch (e) {
      return res
        .status(400)
        .json({ message: 'Không đọc được file. Hãy dùng file .xlsx' });
    }

    if (!rows.length) {
      return res
        .status(400)
        .json({ message: 'File không có dòng dữ liệu nào' });
    }

    // Nhận diện cột theo tiêu đề (không dấu, không phân biệt hoa thường)
    const colMap: Record<string, string> = {};
    const aliases: Record<string, string[]> = {
      name: ['hoten', 'hovaten', 'ten', 'name', 'fullname', 'hosinh'],
      email: ['email', 'mail'],
      className: ['lop', 'class', 'classname'],
      password: ['matkhau', 'password', 'mk'],
      school: ['truong', 'school'],
    };
    for (const key of Object.keys(rows[0])) {
      const norm = this.normalizeHeader(key);
      for (const [field, names] of Object.entries(aliases)) {
        if (names.includes(norm)) colMap[field] = key;
      }
    }
    if (!colMap.name || !colMap.email) {
      return res.status(400).json({
        message:
          'File cần có cột "Họ tên" và "Email" (hỗ trợ thêm cột "Lớp", "Mật khẩu", "Trường")',
      });
    }

    const created: any[] = [];
    const skipped: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = i + 2; // dòng 1 là tiêu đề
      const fullName = String(r[colMap.name] || '').trim();
      const email = String(r[colMap.email] || '').trim().toLowerCase();
      const className = colMap.className
        ? String(r[colMap.className] || '').trim()
        : '';
      const school = colMap.school
        ? String(r[colMap.school] || '').trim()
        : '';
      // Mật khẩu: dùng mật khẩu trong file nếu có; ô trống → tự cấp ngẫu nhiên
      let password = this.randomPassword();
      if (colMap.password) {
        const given = String(r[colMap.password] || '').trim();
        if (given) {
          if (given.length < 6) {
            skipped.push({
              row: rowNo,
              reason: `Mật khẩu phải ≥ 6 ký tự (${fullName})`,
            });
            continue;
          }
          password = given;
        }
      }

      if (!fullName || !email) {
        skipped.push({ row: rowNo, reason: 'Thiếu họ tên hoặc email' });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped.push({ row: rowNo, reason: `Email không hợp lệ: ${email}` });
        continue;
      }
      const exists = await this.prisma.user.findUnique({ where: { email } });
      if (exists) {
        skipped.push({ row: rowNo, reason: `Email đã tồn tại: ${email}` });
        continue;
      }

      const hash = await bcrypt.hash(password, 10);
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: hash,
          role: Role.STUDENT,
          fullName,
          className: className || null,
          school: school || null,
          studentCode: this.randomStudentCode(),
        },
      });
      created.push({
        fullName,
        email,
        className: className || '',
        studentCode: user.studentCode,
        password,
      });
    }

    return res.json({ created, skipped, total: rows.length });
  }
}
