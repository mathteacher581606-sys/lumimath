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
import { AnnouncementsService } from './announcements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('courses/:courseId/announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Param('courseId') courseId: string, @CurrentUser() user: any) {
    return this.announcements.list(courseId, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Post()
  create(
    @Param('courseId') courseId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.announcements.create(courseId, user.id, body, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Patch(':id')
  update(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.announcements.update(courseId, id, user.id, body, user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Delete(':id')
  remove(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.announcements.remove(courseId, id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/comments')
  comment(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.announcements.comment(
      courseId,
      id,
      user.id,
      user.role,
      body?.content,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/react')
  react(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.announcements.react(
      courseId,
      id,
      user.id,
      user.role,
      body?.emoji,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/vote')
  vote(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    return this.announcements.vote(
      courseId,
      id,
      user.id,
      user.role,
      Number(body?.optionIndex),
    );
  }
}
