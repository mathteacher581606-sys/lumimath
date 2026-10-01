import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  grade?: number;

  @IsOptional()
  @IsString()
  parentId?: string;
}
