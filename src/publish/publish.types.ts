import { ModelFinding, PublishDecision } from '../common/interfaces';

export interface PublishAction {
  decision: PublishDecision;
  finding: ModelFinding;
  existing_discussion_id?: string;
  reason: string;
}

export interface PublishResult {
  action: PublishAction;
  success: boolean;
  discussion_id?: string;
  error?: string;
}
