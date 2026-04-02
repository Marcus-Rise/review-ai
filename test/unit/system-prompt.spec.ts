import {
  getSystemPrompt,
  buildUserPrompt,
  SYSTEM_PROMPT,
} from '../../src/model/prompts/system-prompt';

describe('system-prompt', () => {
  describe('getSystemPrompt', () => {
    it('should return default profile prompt', () => {
      const prompt = getSystemPrompt('default');
      expect(prompt).toContain('expert code reviewer');
      expect(prompt).toContain('Output Format');
    });

    it('should return security profile prompt', () => {
      const prompt = getSystemPrompt('security');
      expect(prompt).toContain('security-focused');
      expect(prompt).toContain('Injection vulnerabilities');
    });

    it('should return thorough profile prompt', () => {
      const prompt = getSystemPrompt('thorough');
      expect(prompt).toContain('thorough code reviewer');
      expect(prompt).toContain('race conditions');
    });

    it('should fall back to default for unknown profile', () => {
      const prompt = getSystemPrompt('nonexistent');
      expect(prompt).toBe(getSystemPrompt('default'));
    });
  });

  describe('SYSTEM_PROMPT (deprecated)', () => {
    it('should equal the default profile prompt', () => {
      expect(SYSTEM_PROMPT).toBe(getSystemPrompt('default'));
    });
  });

  describe('buildUserPrompt', () => {
    it('should include MR title and changed files', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Add login',
        mr_description: 'Implements OAuth',
        changes: [{ path: 'src/auth.ts', diff: '+code' }],
        existing_discussions: [],
      });

      expect(prompt).toContain('Add login');
      expect(prompt).toContain('Implements OAuth');
      expect(prompt).toContain('src/auth.ts');
      expect(prompt).toContain('+code');
    });

    it('should omit description section when empty', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Title',
        mr_description: '',
        changes: [{ path: 'a.ts', diff: 'diff' }],
        existing_discussions: [],
      });

      expect(prompt).not.toContain('Description:');
    });

    it('should include user_focus when provided', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Title',
        mr_description: '',
        changes: [],
        existing_discussions: [],
        user_focus: 'Focus on auth',
      });

      expect(prompt).toContain('Developer Focus');
      expect(prompt).toContain('Focus on auth');
    });

    it('should not include user_focus section when not provided', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Title',
        mr_description: '',
        changes: [],
        existing_discussions: [],
      });

      expect(prompt).not.toContain('Developer Focus');
    });

    it('should include unresolved discussions', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Title',
        mr_description: '',
        changes: [],
        existing_discussions: [
          { file_path: 'src/auth.ts', line: 10, body: 'Fix this bug', resolved: false },
          { file_path: 'src/app.ts', line: 5, body: 'Already fixed', resolved: true },
        ],
      });

      expect(prompt).toContain('Existing Unresolved Discussions');
      expect(prompt).toContain('Fix this bug');
      expect(prompt).not.toContain('Already fixed');
    });

    it('should not include discussions section when all are resolved', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Title',
        mr_description: '',
        changes: [],
        existing_discussions: [{ file_path: 'src/app.ts', line: 5, body: 'Fixed', resolved: true }],
      });

      expect(prompt).not.toContain('Existing Unresolved Discussions');
    });

    it('should handle discussion without file_path (general comment)', () => {
      const prompt = buildUserPrompt({
        mr_title: 'Title',
        mr_description: '',
        changes: [],
        existing_discussions: [{ body: 'General note', resolved: false }],
      });

      expect(prompt).toContain('[general]');
      expect(prompt).toContain('General note');
    });
  });
});
