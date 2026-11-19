import { Allow, IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateLessonDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  chapter?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsString()
  youtubeUrl?: string;

  @IsOptional()
  @IsArray()
  pdfLinks?: string[];

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

  // Bài nháp (học sinh không thấy)
  @IsOptional()
  @Allow()
  hidden?: boolean;

  // Hẹn giờ mở bài (ISO) — null/'' = mở ngay
  @IsOptional()
  @Allow()
  publishAt?: string | null;
}
