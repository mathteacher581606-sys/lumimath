import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên bài giảng' })
  title: string;

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
