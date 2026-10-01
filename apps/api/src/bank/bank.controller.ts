import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { BankService } from './bank.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ImportTexDto } from './dto/import-tex.dto';

@Controller('bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  // ============ CHỦ ĐỀ ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('topics')
  listTopics(@CurrentUser() user: any) {
    return this.bankService.listTopics(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('topics')
  createTopic(@CurrentUser() user: any, @Body() dto: CreateTopicDto) {
    return this.bankService.createTopic(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch('topics/:id')
  updateTopic(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.bankService.updateTopic(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('topics/:id')
  removeTopic(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.removeTopic(user.id, id);
  }

  // ============ CÂU HỎI ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('questions')
  listQuestions(@CurrentUser() user: any, @Query() query: any) {
    return this.bankService.listQuestions(user.id, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('questions')
  createQuestion(@CurrentUser() user: any, @Body() dto: CreateQuestionDto) {
    return this.bankService.createQuestion(user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('questions/:id')
  getQuestion(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.getQuestion(user.id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch('questions/:id')
  updateQuestion(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.bankService.updateQuestion(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete('questions/:id')
  removeQuestion(@CurrentUser() user: any, @Param('id') id: string) {
    return this.bankService.removeQuestion(user.id, id);
  }

  // ============ NHẬP ĐỀ TỪ .tex ============

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('import-tex')
  importTex(@CurrentUser() user: any, @Body() dto: ImportTexDto) {
    return this.bankService.importTex(user.id, dto.texSource);
  }
}
