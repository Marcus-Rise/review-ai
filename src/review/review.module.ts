import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ContextBuilderService } from './context-builder.service';
import { CONTEXT_LIMITS, PROVIDER_LIMITS } from './context-limits';
import { GitLabModule } from '../gitlab/gitlab.module';
import { ModelModule } from '../model/model.module';
import { PublishModule } from '../publish/publish.module';

@Module({
  imports: [GitLabModule, ModelModule, PublishModule],
  controllers: [ReviewController],
  providers: [
    ReviewService,
    ContextBuilderService,
    {
      provide: CONTEXT_LIMITS,
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('MODEL_PROVIDER', 'openai');
        return PROVIDER_LIMITS[provider] ?? PROVIDER_LIMITS.openai;
      },
      inject: [ConfigService],
    },
  ],
})
export class ReviewModule {}
