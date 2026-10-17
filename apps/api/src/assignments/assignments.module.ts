import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { MailModule } from '../mail/mail.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ExamsModule } from '../exams/exams.module';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { CommentTemplatesController } from './comment-templates.controller';

@Module({
  imports: [PrismaModule, AiModule, MailModule, GamificationModule, ExamsModule],
  controllers: [AssignmentsController, CommentTemplatesController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
