import { IsOptional, IsString } from 'class-validator';

export class GradeEssayDto {
  @IsString()
  prompt: string;

  @IsOptional()
  @IsString()
  rubric?: string;

  @IsString()
  studentAnswer: string;
}
