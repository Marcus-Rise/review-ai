export interface GitLabMergeRequest {
  iid: number;
  title: string;
  description: string;
  source_branch: string;
  target_branch: string;
  state: string;
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
  web_url: string;
}

export interface GitLabDiffVersion {
  id: number;
  head_commit_sha: string;
  base_commit_sha: string;
  start_commit_sha: string;
  created_at: string;
  state: string;
}

export interface GitLabChange {
  old_path: string;
  new_path: string;
  a_mode: string;
  b_mode: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  diff: string;
}

export interface GitLabDiscussionNote {
  id: number;
  body: string;
  author: { username: string };
  created_at: string;
  system: boolean;
  resolvable: boolean;
  resolved: boolean;
  position?: GitLabNotePosition;
}

export interface GitLabNotePosition {
  base_sha: string;
  start_sha: string;
  head_sha: string;
  position_type: string;
  new_path?: string;
  old_path?: string;
  new_line?: number;
  old_line?: number;
}

export interface GitLabDiscussion {
  id: string;
  notes: GitLabDiscussionNote[];
}

export interface GitLabDiffPositionPayload {
  position_type: 'text';
  base_sha: string;
  start_sha: string;
  head_sha: string;
  new_path: string;
  old_path: string;
  new_line: number;
}

export interface CreateDiscussionPayload {
  body: string;
  position: GitLabDiffPositionPayload;
}
