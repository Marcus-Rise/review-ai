const MAX_USER_FOCUS_LENGTH = 500;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?(your\s+)?instructions/i,
  /you\s+are\s+now/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /<\|im_start\|>/i,
];

export function sanitizeUserFocus(input: string | undefined): string | undefined {
  if (!input || typeof input !== 'string') {
    return undefined;
  }

  let sanitized = input.trim();

  if (sanitized.length === 0) {
    return undefined;
  }

  if (sanitized.length > MAX_USER_FOCUS_LENGTH) {
    sanitized = sanitized.slice(0, MAX_USER_FOCUS_LENGTH);
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      return undefined;
    }
  }

  // Strip control characters except newlines
  sanitized = sanitized.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized || undefined;
}
