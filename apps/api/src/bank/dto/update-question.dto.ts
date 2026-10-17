import {
  Allow,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Difficulty, QuestionType } from '@prisma/client';

export class UpdateQuestionDto {
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsString()
  content?: string;

  @Allow()
  options?: any;

  @Allow()
  answer?: any;

  @IsOptional()
  @IsString()
  solution?: string;

  @IsOptional()
  @IsInt()
  grade?: number;

  @IsOptional()
  @IsString()
  topicId?: string;

  // Tên chủ đề (text) — form sửa gửi tên: tự tìm/tạo chủ đề rồi chuyển câu hỏi vào
  @Allow()
  topicName?: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  texSource?: string;
}
