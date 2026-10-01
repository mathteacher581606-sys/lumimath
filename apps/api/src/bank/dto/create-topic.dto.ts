import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
