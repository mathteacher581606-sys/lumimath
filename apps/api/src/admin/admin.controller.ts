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
        grade: true,
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
    if (typeof body.grade === 'number' && Number.isFinite(body.grade)) {
      data.grade = body.grade >= 1 && body.grade <= 12 ? Math.round(body.grade) : null;
    }

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

  // Tải file mẫu nhập học sinh (Excel) — đúng cột mà hệ thống đọc được
  @Get('import-students/template')
  async importTemplate(@Res() res: Response) {
    const sample = [
      {
        'Họ tên': 'Nguyễn Văn A',
        Email: 'nguyenvana@example.com',
        'Khối': 12,
        'Lớp': '12A1',
        'Mật khẩu': 'Abc12345',
        'Trường': 'THPT Chuyên Trần Phú',
      },
      {
        'Họ tên': 'Trần Thị B',
        Email: 'tranthib@example.com',
        'Khối': 12,
        'Lớp': '12A1',
        'Mật khẩu': '',
        'Trường': '',
      },
      {
        'Họ tên': 'Lê Văn C',
        Email: 'levanc@example.com',
        'Khối': 11,
        'Lớp': '11A2',
        'Mật khẩu': '',
        'Trường': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Học sinh');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent('mau-nhap-hoc-sinh.xlsx')}`,
    );
    res.send(buffer);
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
      grade: ['khoi', 'grade'],
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
      let grade: number | null = null;
      if (colMap.grade) {
        const g = parseInt(String(r[colMap.grade] || '').trim(), 10);
        if (!isNaN(g) && g >= 1 && g <= 12) grade = g;
      }
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
          grade,
          school: school || null,
          studentCode: this.randomStudentCode(),
        },
      });
      created.push({
        fullName,
        email,
        className: className || '',
        grade,
        studentCode: user.studentCode,
        password,
      });
    }

    return res.json({ created, skipped, total: rows.length });
  }

  // ============ KHÓA HỌC (THÊM NHIỀU TÀI KHOẢN VÀO KHÓA HỌC) ============

  // Danh sách khóa học (tất cả giáo viên)
  @Get('courses')
  async courses() {
    const courses = await this.prisma.course.findMany({
      select: {
        id: true,
        title: true,
        grade: true,
        teacher: { select: { fullName: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return courses.map((c) => ({
      id: c.id,
      title: c.title,
      grade: c.grade,
      teacher: c.teacher?.fullName || '',
      studentCount: c._count?.enrollments ?? 0,
    }));
  }

  // Thêm nhiều tài khoản (theo email) vào một khóa học.
  // Tài khoản chưa tồn tại sẽ được tạo tự động (học sinh, mật khẩu ngẫu nhiên).
  @Post('courses/:courseId/enroll')
  async enrollMany(
    @Param('courseId') courseId: string,
    @Body() body: any,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    const rawEmails: any[] = Array.isArray(body?.emails) ? body.emails : [];
    const emails: string[] = rawEmails
      .map((e: any) => String(e).trim().toLowerCase())
      .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    const unique: string[] = [...new Set(emails)];

    const enrolled: string[] = [];
    const created: { email: string; password: string }[] = [];
    const already: string[] = [];
    const notStudent: string[] = [];

    for (const email of unique) {
      let user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) {
        const pwd = this.randomPassword();
        const hash = await bcrypt.hash(pwd, 10);
        user = await this.prisma.user.create({
          data: {
            email,
            passwordHash: hash,
            role: Role.STUDENT,
            fullName: email.split('@')[0],
            studentCode: this.randomStudentCode(),
          },
        });
        created.push({ email, password: pwd });
      }
      if (user.role !== Role.STUDENT) {
        notStudent.push(email);
        continue;
      }
      const existing = await this.prisma.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: user.id } },
      });
      if (existing) {
        already.push(email);
        continue;
      }
      await this.prisma.enrollment.create({
        data: { courseId, studentId: user.id },
      });
      enrolled.push(email);
    }

    return { enrolled, created, already, notStudent, total: unique.length };
  }
}
