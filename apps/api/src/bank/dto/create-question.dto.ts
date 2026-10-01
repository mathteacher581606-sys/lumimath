import {
  Allow,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Difficulty, QuestionType } from '@prisma/client';

export class CreateQuestionDto {
  @IsEnum(QuestionType, { message: 'Loại câu hỏi không hợp lệ' })
  type: QuestionType;

  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập nội dung câu hỏi' })
  content: string;

  @Allow()
  options?: any;

  @Allow()
  @IsDefined({ message: 'Vui lòng nhập đáp án' })
  answer: any;

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
  @IsEnum(Difficulty, { message: 'Độ khó không hợp lệ' })
  difficulty?: Difficulty;

  @IsOptional()
  @IsString()
  texSource?: string;
}
