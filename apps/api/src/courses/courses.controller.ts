import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateCourseDto) {
    return this.coursesService.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.coursesService.findAll(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  myCourses(@CurrentUser() user: any) {
    return this.coursesService.myCourses(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.coursesService.remove(id, user.id);
  }

  // ============ BÀI GIẢNG ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':courseId/lessons')
  createLesson(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateLessonDto,
  ) {
    return this.coursesService.createLesson(courseId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':courseId/lessons/:lessonId')
  updateLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.coursesService.updateLesson(lessonId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':courseId/lessons/:lessonId')
  removeLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: any,
  ) {
    return this.coursesService.removeLesson(lessonId, user.id);
  }

  // ============ ĐĂNG KÝ ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/enroll')
  enroll(@Param('id') id: string, @CurrentUser() user: any) {
    return this.coursesService.enroll(id, user.id);
  }
}
