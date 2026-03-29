import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ContextBuilderService } from './context-builder.service';
import { GitLabModule } from '../gitlab/gitlab.module';
import { ModelModule } from '../model/model.module';
import { PublishModule } from '../publish/publish.module';

@Module({
  imports: [GitLabModule, ModelModule, PublishModule],
  controllers: [ReviewController],
  providers: [ReviewService, ContextBuilderService],
})
export class ReviewModule {}
