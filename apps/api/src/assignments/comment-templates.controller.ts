import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AssignmentsService } from './assignments.service';

// Ngân hàng nhận xét dùng lại của giáo viên (gợi ý khi chấm bài)
@Controller('comment-templates')
export class CommentTemplatesController {
  constructor(private readonly assignments: AssignmentsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get()
  list(@CurrentUser() user: any) {
    return this.assignments.listCommentTemplates(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.assignments.createCommentTemplate(user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.assignments.deleteCommentTemplate(user.id, id);
  }
}
