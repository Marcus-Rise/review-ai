import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GitLabDto {
  @ApiProperty({ description: 'GitLab instance base URL' })
  @IsString()
  @IsNotEmpty()
  base_url!: string;

  @ApiPropertyOptional({ description: 'Project path (group/project)' })
  @IsString()
  @IsOptional()
  project_path?: string;

  @ApiPropertyOptional({ description: 'Project ID' })
  @IsNumber()
  @IsOptional()
  project_id?: number;

  @ApiProperty({ description: 'Merge request IID' })
  @IsNumber()
  mr_iid!: number;

  @ApiProperty({ description: 'GitLab access token' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({ description: 'Base SHA override' })
  @IsString()
  @IsOptional()
  base_sha?: string;

  @ApiPropertyOptional({ description: 'Head SHA override' })
  @IsString()
  @IsOptional()
  head_sha?: string;
}

export class ReviewOptionsDto {
  @ApiProperty({ description: 'Review mode', default: 'mr' })
  @IsString()
  @IsIn(['mr'])
  mode: string = 'mr';

  @ApiProperty({ description: 'Dry run mode — no publishing', default: false })
  @IsBoolean()
  dry_run: boolean = false;

  @ApiProperty({ description: 'Review profile', default: 'default' })
  @IsString()
  @IsIn(['default'])
  profile: string = 'default';

  @ApiPropertyOptional({
    description: 'Developer focus hint (advisory only, max 500 chars)',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  user_focus?: string;
}

export class RunReviewDto {
  @ApiProperty({ description: 'API version', example: 'v1' })
  @IsString()
  @IsIn(['v1'])
  api_version!: string;

  @ApiProperty({ type: GitLabDto })
  @ValidateNested()
  @Type(() => GitLabDto)
  gitlab!: GitLabDto;

  @ApiProperty({ type: ReviewOptionsDto })
  @ValidateNested()
  @Type(() => ReviewOptionsDto)
  review!: ReviewOptionsDto;
}
