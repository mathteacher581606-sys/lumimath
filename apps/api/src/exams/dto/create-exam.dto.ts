import {
  Allow,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateExamDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  grade?: number;

  @IsOptional()
  @IsInt()
  duration?: number;

  // Ma trận đề: { parts: [{ type, count, score }] }
  @Allow()
  matrix: any;
}
