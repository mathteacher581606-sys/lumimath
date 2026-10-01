import { IsString } from 'class-validator';

export class ImportTexDto {
  @IsString()
  texSource: string;
}
