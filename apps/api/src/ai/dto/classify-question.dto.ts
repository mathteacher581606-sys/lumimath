import { IsString } from 'class-validator';

export class ClassifyQuestionDto {
  @IsString()
  content: string;
}
