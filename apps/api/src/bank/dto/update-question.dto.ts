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

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  texSource?: string;
}
