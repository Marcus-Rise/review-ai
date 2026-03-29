import { ApiProperty } from '@nestjs/swagger';

export class PublishErrorDto {
  @ApiProperty()
  path!: string;

  @ApiProperty()
  line!: number;

  @ApiProperty()
  error!: string;
}

export class ReviewActionDto {
  @ApiProperty()
  type!: string;

  @ApiProperty()
  path!: string;

  @ApiProperty()
  line!: number;

  @ApiProperty({ required: false })
  discussion_id?: string;

  @ApiProperty()
  reason!: string;

  @ApiProperty({ required: false })
  body?: string;
}

export class ReviewSummaryDto {
  @ApiProperty()
  findings_considered!: number;

  @ApiProperty()
  actions_published!: number;

  @ApiProperty()
  replies_posted!: number;

  @ApiProperty()
  skipped_duplicates!: number;

  @ApiProperty()
  dry_run!: boolean;
}

export class ReviewResponseDto {
  @ApiProperty()
  request_id!: string;

  @ApiProperty()
  status!: 'ok' | 'partial' | 'error';

  @ApiProperty({ type: ReviewSummaryDto })
  summary!: ReviewSummaryDto;

  @ApiProperty({ type: [ReviewActionDto] })
  actions!: ReviewActionDto[];

  @ApiProperty({ type: [String] })
  warnings!: string[];

  @ApiProperty({ type: [PublishErrorDto] })
  errors!: PublishErrorDto[];
}
