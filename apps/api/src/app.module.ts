import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CoursesModule } from './courses/courses.module';
import { BankModule } from './bank/bank.module';
import { ExamsModule } from './exams/exams.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    AuthModule,
    CoursesModule,
    BankModule,
    ExamsModule,
    AiModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
