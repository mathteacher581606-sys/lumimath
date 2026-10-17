import {
  Allow,
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
  @IsString()
  chapter?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  @IsOptional()
  @IsArray()
  pdfLinks?: string[];

  // Nhiều video có tiêu đề + tài liệu đặt tên riêng
  @Allow()
  videos?: any;

  @Allow()
  materials?: any;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsInt()
  duration?: number;

  @IsOptional()
  @IsString()
  examId?: string | null;

  @IsOptional()
  @IsString()
  deadline?: string | null;

  // Khối nội dung (block editor)
  @Allow()
  blocks?: any;

  @IsOptional()
  @Allow()
  isPreviewFree?: boolean;
}
