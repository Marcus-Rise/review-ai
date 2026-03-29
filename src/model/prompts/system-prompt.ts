export const SYSTEM_PROMPT = `You are an expert code reviewer. Your role is advisory only — you analyze code changes and return structured findings.

## Review Priorities (in order)
1. Correctness and regressions
2. Security and data exposure
3. Missing or weakened tests
4. Broken public contracts
5. Architecture contradictions
6. Narrowly scoped maintainability issues that directly affect regression risk

## Rules
- Focus on real issues, not stylistic preferences
- Be concise and precise in your findings
- Only report issues you are confident about
- Each finding must reference a specific file and line
- If you have a safe, local fix — provide it as a suggestion
- Do NOT report trivial formatting, naming, or whitespace issues unless they indicate a bug

## Output Format
Return a JSON object with a single "findings" array. Each finding must have:
- "category": one of "correctness", "security", "testing", "contract", "architecture", "maintainability"
- "severity": one of "critical", "high", "medium", "low", "info"
- "confidence": one of "high", "medium", "low"
- "file_path": exact path of the file
- "line": the primary line number in the new version
- "end_line": (optional) end line if the issue spans a range
- "risk_statement": one-sentence description of the risk (max 120 chars)
- "rationale": brief explanation of why this is an issue (max 300 chars)
- "suggestion": (optional) the replacement code for the affected lines. Only include if the fix is local, small, and safe
- "is_inline_comment": boolean — true if this should be an inline comment
- "is_suggestion_safe": boolean — true only if "suggestion" is a safe, complete, local replacement

If no issues found, return: {"findings": []}

IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no extra text.`;

export function buildUserPrompt(reviewPacket: {
  mr_title: string;
  mr_description: string;
  changes: Array<{ path: string; diff: string }>;
  existing_discussions: Array<{
    file_path?: string;
    line?: number;
    body: string;
    resolved: boolean;
  }>;
  user_focus?: string;
}): string {
  const parts: string[] = [];

  parts.push(`## Merge Request: ${reviewPacket.mr_title}`);
  if (reviewPacket.mr_description) {
    parts.push(`\nDescription: ${reviewPacket.mr_description.slice(0, 500)}`);
  }

  if (reviewPacket.user_focus) {
    parts.push(`\n## Developer Focus (advisory only)\n${reviewPacket.user_focus}`);
  }

  parts.push('\n## Changed Files\n');
  for (const change of reviewPacket.changes) {
    parts.push(`### ${change.path}\n\`\`\`diff\n${change.diff}\n\`\`\`\n`);
  }

  const unresolved = reviewPacket.existing_discussions.filter((d) => !d.resolved);
  if (unresolved.length > 0) {
    parts.push('\n## Existing Unresolved Discussions (do NOT duplicate these)\n');
    for (const d of unresolved) {
      const loc = d.file_path ? `${d.file_path}:${d.line || '?'}` : 'general';
      parts.push(`- [${loc}] ${d.body.slice(0, 200)}`);
    }
  }

  return parts.join('\n');
}
