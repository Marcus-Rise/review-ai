import { Module } from '@nestjs/common';
import { DecisionEngineService } from './decision-engine.service';
import { PublisherService } from './publisher.service';
import { GitLabModule } from '../gitlab/gitlab.module';

@Module({
  imports: [GitLabModule],
  providers: [DecisionEngineService, PublisherService],
  exports: [DecisionEngineService, PublisherService],
})
export class PublishModule {}
