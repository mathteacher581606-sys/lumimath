import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  @IsOptional()
  @IsArray()
  pdfLinks?: string[];

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  duration?: number;
}
