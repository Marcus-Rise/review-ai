export interface ReviewFileChange {
  path: string;
  old_path: string;
  diff: string;
  new_file: boolean;
  deleted_file: boolean;
  renamed_file: boolean;
}

export interface ExistingDiscussionSummary {
  discussion_id: string;
  file_path: string | undefined;
  line: number | undefined;
  body: string;
  resolved: boolean;
  author: string;
  fingerprint: string;
}

export interface ReviewPacket {
  mr_title: string;
  mr_description: string;
  source_branch: string;
  target_branch: string;
  changes: ReviewFileChange[];
  existing_discussions: ExistingDiscussionSummary[];
  diff_refs: {
    base_sha: string;
    head_sha: string;
    start_sha: string;
  };
  review_profile: string;
  user_focus?: string;
}
