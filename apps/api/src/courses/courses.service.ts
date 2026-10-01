import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ KHÓA HỌC ============

  async create(teacherId: string, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        teacherId,
        title: dto.title,
        description: dto.description,
        coverUrl: dto.coverUrl,
        grade: dto.grade,
        subject: dto.subject ?? 'Toán',
        isPublished: dto.isPublished ?? false,
      },
    });
  }

  async findAll(user: { id: string; role: Role }) {
    if (user.role === Role.TEACHER) {
      return this.prisma.course.findMany({
        where: { teacherId: user.id },
        include: {
          _count: { select: { lessons: true, enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.course.findMany({
      where: { isPublished: true },
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        _count: { select: { lessons: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, fullName: true, school: true } },
        lessons: { orderBy: { order: 'asc' } },
      },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    return course;
  }

  async update(id: string, teacherId: string, dto: UpdateCourseDto) {
    await this.getOwnedCourse(id, teacherId);
    return this.prisma.course.update({ where: { id }, data: { ...dto } });
  }

  async remove(id: string, teacherId: string) {
    await this.getOwnedCourse(id, teacherId);
    return this.prisma.course.delete({ where: { id } });
  }

  // ============ BÀI GIẢNG ============

  async createLesson(courseId: string, teacherId: string, dto: CreateLessonDto) {
    await this.getOwnedCourse(courseId, teacherId);
    return this.prisma.lesson.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description,
        order: dto.order ?? 0,
        youtubeUrl: dto.youtubeUrl,
        pdfLinks: dto.pdfLinks ?? [],
        content: dto.content,
        duration: dto.duration,
      },
    });
  }

  async updateLesson(
    lessonId: string,
    teacherId: string,
    dto: UpdateLessonDto,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (lesson.course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu bài giảng này');
    }
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { ...dto },
    });
  }

  async removeLesson(lessonId: string, teacherId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { course: true },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài giảng');
    if (lesson.course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu bài giảng này');
    }
    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  // ============ ĐĂNG KÝ KHÓA HỌC ============

  async enroll(courseId: string, studentId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');

    return this.prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId } },
      update: {},
      create: { courseId, studentId },
    });
  }

  async myCourses(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, fullName: true, school: true } },
            _count: { select: { lessons: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  // ============ HELPER ============

  private async getOwnedCourse(id: string, teacherId: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (course.teacherId !== teacherId) {
      throw new ForbiddenException('Bạn không sở hữu khóa học này');
    }
    return course;
  }
}
