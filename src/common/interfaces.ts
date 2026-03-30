export interface ReviewAction {
  type: 'new_discussion' | 'new_discussion_with_suggestion' | 'reply' | 'skip';
  path: string;
  line: number;
  discussion_id?: string;
  reason: string;
  body?: string;
}

export interface ReviewSummary {
  findings_considered: number;
  actions_published: number;
  replies_posted: number;
  skipped_duplicates: number;
  dry_run: boolean;
}

export interface PublishError {
  path: string;
  line: number;
  error: string;
}

export interface ReviewResponse {
  request_id: string;
  status: 'ok' | 'partial' | 'error';
  summary: ReviewSummary;
  actions: ReviewAction[];
  warnings: string[];
  errors: PublishError[];
}

export interface ModelFinding {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  confidence: 'high' | 'medium' | 'low';
  file_path: string;
  line: number;
  end_line?: number;
  risk_statement: string;
  rationale: string;
  suggestion?: string;
  is_inline_comment: boolean;
  is_suggestion_safe: boolean;
}

export type PublishDecision =
  | 'skip'
  | 'reply'
  | 'new_discussion'
  | 'new_discussion_with_suggestion';

export interface GitLabConfig {
  base_url: string;
  project_path?: string;
  project_id?: number;
  mr_iid: number;
  token: string;
  base_sha?: string;
  head_sha?: string;
}

export interface ReviewConfig {
  mode: string;
  dry_run: boolean;
  profile: string;
  user_focus?: string;
}
