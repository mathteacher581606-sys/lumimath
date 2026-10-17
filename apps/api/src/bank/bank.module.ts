import { Module } from '@nestjs/common';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';
import { AiModule } from '../ai/ai.module';
import { ExamsModule } from '../exams/exams.module';

@Module({
  imports: [AiModule, ExamsModule],
  controllers: [BankController],
  providers: [BankService],
  exports: [BankService],
})
export class BankModule {}
