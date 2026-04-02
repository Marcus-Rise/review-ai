import {
  buildDiscussionFingerprint,
  buildFindingFingerprint,
} from '../../src/review/fingerprint.util';
import { GitLabDiscussion } from '../../src/gitlab/gitlab.types';

describe('fingerprint.util', () => {
  describe('buildDiscussionFingerprint', () => {
    it('should return empty string when discussion has no notes', () => {
      const discussion = { id: 'd1', notes: [] } as unknown as GitLabDiscussion;
      expect(buildDiscussionFingerprint(discussion)).toBe('');
    });

    it('should build fingerprint from note position and body', () => {
      const discussion = {
        id: 'd1',
        notes: [
          {
            body: 'Security issue found',
            position: { new_path: 'src/auth.ts', new_line: 10, old_path: null, old_line: null },
            author: { username: 'reviewer' },
            system: false,
            resolved: false,
          },
        ],
      } as unknown as GitLabDiscussion;

      const fingerprint = buildDiscussionFingerprint(discussion);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should produce consistent fingerprints for same input', () => {
      const discussion = {
        id: 'd1',
        notes: [
          {
            body: 'Same body',
            position: { new_path: 'file.ts', new_line: 5, old_path: null, old_line: null },
            author: { username: 'bot' },
            system: false,
            resolved: false,
          },
        ],
      } as unknown as GitLabDiscussion;

      expect(buildDiscussionFingerprint(discussion)).toBe(buildDiscussionFingerprint(discussion));
    });

    it('should fall back to old_path when new_path is missing', () => {
      const discussion = {
        id: 'd1',
        notes: [
          {
            body: 'Deleted file issue',
            position: { new_path: null, old_path: 'old/file.ts', new_line: null, old_line: 3 },
            author: { username: 'bot' },
            system: false,
            resolved: false,
          },
        ],
      } as unknown as GitLabDiscussion;

      const fingerprint = buildDiscussionFingerprint(discussion);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should handle note without position', () => {
      const discussion = {
        id: 'd1',
        notes: [
          {
            body: 'General comment',
            position: null,
            author: { username: 'bot' },
            system: false,
            resolved: false,
          },
        ],
      } as unknown as GitLabDiscussion;

      const fingerprint = buildDiscussionFingerprint(discussion);
      expect(fingerprint).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('buildFindingFingerprint', () => {
    it('should build fingerprint from file path, line, category, and risk statement', () => {
      const fp = buildFindingFingerprint('src/auth.ts', 10, 'security', 'Open redirect');
      expect(fp).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should produce different fingerprints for different inputs', () => {
      const fp1 = buildFindingFingerprint('a.ts', 1, 'security', 'issue A');
      const fp2 = buildFindingFingerprint('b.ts', 1, 'security', 'issue A');
      expect(fp1).not.toBe(fp2);
    });

    it('should normalize body (case insensitive, stripped punctuation)', () => {
      const fp1 = buildFindingFingerprint('a.ts', 1, 'security', 'Open Redirect!!!');
      const fp2 = buildFindingFingerprint('a.ts', 1, 'security', 'open redirect');
      expect(fp1).toBe(fp2);
    });
  });
});
