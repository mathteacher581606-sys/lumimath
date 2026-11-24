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

  // Công khai cho học sinh thi thử
  @IsOptional()
  @Allow()
  published?: boolean;

  // Phân loại: chủ đề + độ khó
  @IsOptional()
  @IsString()
  topicId?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  // Thư mục chứa đề thi (cây mục lục Kho đề thi)
  @IsOptional()
  @IsString()
  folderId?: string;

  // Danh sách id câu hỏi GV đã DUYỆT (theo đúng thứ tự các ô trong ma trận).
  // Nếu có → lưu đúng các câu này, không chọn ngẫu nhiên nữa.
  @IsOptional()
  @Allow()
  questionIds?: string[];

  // true: questionIds[i] ứng đúng ô thứ i của ma trận (null = ô trống, bỏ qua — không tự bốc câu)
  @IsOptional()
  @Allow()
  strict?: boolean;
}
