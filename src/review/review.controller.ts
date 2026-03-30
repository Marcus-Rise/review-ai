import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { ReviewService } from './review.service';
import { RunReviewDto } from './dto/run-review.dto';
import { ReviewResponseDto } from './dto/review-response.dto';
import { ClientConfig } from '../auth/clients-config.interface';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('run')
  @Version('1')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'X-Client-Id', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Run AI code review on a GitLab merge request' })
  @ApiResponse({ status: 200, description: 'Review completed', type: ReviewResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Rate limited' })
  async runReview(
    @Body() dto: RunReviewDto,
    @Req() req: FastifyRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ReviewResponseDto> {
    const requestId = (req as unknown as Record<string, unknown>)['requestId'] as string;
    const client = (req as unknown as Record<string, unknown>)['client'] as ClientConfig;

    return this.reviewService.runReview(dto, requestId, client, idempotencyKey);
  }

  @Get('help')
  @Version('1')
  @ApiOperation({ summary: 'Human-readable help and usage summary' })
  @ApiResponse({ status: 200, description: 'Help information' })
  getHelp() {
    return {
      service: 'AI Review Service',
      version: 'v1',
      description:
        'Self-hosted AI code review service for GitLab Self-Managed. ' +
        'Triggered by manual GitLab CI jobs.',
      endpoints: {
        'POST /api/v1/reviews/run': 'Run AI review on a merge request',
        'GET /api/v1/reviews/help': 'This help page',
        'GET /healthz': 'Liveness check',
        'GET /readyz': 'Readiness check',
        'GET /docs': 'Swagger / OpenAPI documentation',
      },
      authentication: {
        required_headers: ['Authorization: Bearer <api_key>', 'X-Client-Id: <client_id>'],
        optional_headers: [
          'X-Request-Timestamp: <unix_timestamp>',
          'X-Request-Signature: <hmac_sha256>',
          'Idempotency-Key: <unique_key>',
        ],
      },
      review_modes: ['mr'],
      review_profiles: ['default', 'security', 'thorough'],
    };
  }
}
