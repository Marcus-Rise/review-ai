import { DecisionEngineService } from '../../src/publish/decision-engine.service';
import { ModelFinding } from '../../src/common/interfaces';
import { ExistingDiscussionSummary } from '../../src/review/review-packet.interface';
import { buildFindingFingerprint } from '../../src/review/fingerprint.util';

const baseFinding: ModelFinding = {
  category: 'correctness',
  severity: 'high',
  confidence: 'high',
  file_path: 'src/foo.ts',
  line: 10,
  risk_statement: 'Null pointer risk',
  rationale: 'Variable may be null',
  is_inline_comment: true,
  is_suggestion_safe: false,
};

describe('DecisionEngineService', () => {
  let engine: DecisionEngineService;

  beforeEach(() => {
    engine = new DecisionEngineService();
  });

  it('should create new discussion for new findings', () => {
    const actions = engine.decide([baseFinding], []);
    expect(actions).toHaveLength(1);
    expect(actions[0].decision).toBe('new_discussion');
  });

  it('should skip when matching unresolved discussion exists', () => {
    const fp = buildFindingFingerprint('src/foo.ts', 10, 'correctness', 'Null pointer risk');
    const existing: ExistingDiscussionSummary = {
      discussion_id: 'd1',
      file_path: 'src/foo.ts',
      line: 10,
      body: 'correctness issue here',
      resolved: false,
      author: 'bot',
      fingerprint: fp,
    };
    const actions = engine.decide([baseFinding], [existing]);
    expect(actions[0].decision).toBe('skip');
  });

  it('should create new discussion when matching discussion is resolved', () => {
    const fp = buildFindingFingerprint('src/foo.ts', 10, 'correctness', 'Null pointer risk');
    const existing: ExistingDiscussionSummary = {
      discussion_id: 'd1',
      file_path: 'src/foo.ts',
      line: 10,
      body: 'correctness issue',
      resolved: true,
      author: 'bot',
      fingerprint: fp,
    };
    const actions = engine.decide([baseFinding], [existing]);
    expect(actions[0].decision).toBe('new_discussion');
  });

  it('should reply to nearby unresolved discussion', () => {
    const existing: ExistingDiscussionSummary = {
      discussion_id: 'd2',
      file_path: 'src/foo.ts',
      line: 11, // nearby (within 3 lines)
      body: 'some other issue',
      resolved: false,
      author: 'bot',
      fingerprint: 'different-fp',
    };
    const actions = engine.decide([baseFinding], [existing]);
    expect(actions[0].decision).toBe('reply');
    expect(actions[0].existing_discussion_id).toBe('d2');
  });

  it('should use suggestion when safe', () => {
    const findingWithSuggestion: ModelFinding = {
      ...baseFinding,
      is_suggestion_safe: true,
      suggestion: 'const x = value ?? default;',
    };
    const actions = engine.decide([findingWithSuggestion], []);
    expect(actions[0].decision).toBe('new_discussion_with_suggestion');
  });

  it('should not suggest for critical security issues', () => {
    const finding: ModelFinding = {
      ...baseFinding,
      category: 'security',
      severity: 'critical',
      is_suggestion_safe: true,
      suggestion: 'fix here',
    };
    const actions = engine.decide([finding], []);
    expect(actions[0].decision).toBe('new_discussion');
  });
});
