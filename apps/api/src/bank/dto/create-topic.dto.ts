import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTopicDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên chủ đề' })
  name: string;

  @IsOptional()
  @IsInt()
  grade?: number;

  @IsOptional()
  @IsString()
  parentId?: string;

  // true = tạo "nhóm" tự đặt tên ở gốc (không thuộc lớp số)
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}
