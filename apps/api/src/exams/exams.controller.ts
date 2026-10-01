import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { ExamsService } from './exams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExamDto } from './dto/create-exam.dto';

@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateExamDto) {
    return this.examsService.create(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.examsService.findAll(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.findOne(user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.remove(user.id, id);
  }

  // Tải file .tex
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get(':id/tex')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="exam.tex"')
  getTex(@CurrentUser() user: any, @Param('id') id: string) {
    return this.examsService.getTex(user.id, id);
  }

  // Compile PDF
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post(':id/compile')
  @Header('Content-Type', 'application/pdf')
  async compile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.examsService.compile(user.id, id);
    res.setHeader('Content-Disposition', 'attachment; filename="exam.pdf"');
    res.send(pdf);
  }
}
