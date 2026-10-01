import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GradeEssayDto } from './dto/grade-essay.dto';
import { ClassifyQuestionDto } from './dto/classify-question.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('grade-essay')
  gradeEssay(@Body() dto: GradeEssayDto) {
    return this.aiService.gradeEssay(
      dto.prompt,
      dto.rubric || '',
      dto.studentAnswer,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post('classify-question')
  classifyQuestion(@Body() dto: ClassifyQuestionDto) {
    return this.aiService.classifyQuestion(dto.content);
  }
}
