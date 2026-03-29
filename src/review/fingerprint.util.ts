import { createHash } from 'node:crypto';
import { GitLabDiscussion } from '../gitlab/gitlab.types';

export function buildDiscussionFingerprint(discussion: GitLabDiscussion): string {
  const firstNote = discussion.notes[0];
  if (!firstNote) return '';

  const position = firstNote.position;
  const parts = [
    position?.new_path || position?.old_path || '',
    String(position?.new_line || position?.old_line || 0),
    normalizeBody(firstNote.body).slice(0, 200),
  ];

  return createHash('md5').update(parts.join('|')).digest('hex');
}

export function buildFindingFingerprint(
  filePath: string,
  line: number,
  category: string,
  riskStatement: string,
): string {
  const parts = [filePath, String(line), category, normalizeBody(riskStatement).slice(0, 200)];
  return createHash('md5').update(parts.join('|')).digest('hex');
}

function normalizeBody(body: string): string {
  return body
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}
