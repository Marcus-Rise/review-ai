export interface ContextLimits {
  maxFiles: number;
  maxDiffCharsPerFile: number;
  maxTotalDiffChars: number;
  /** UTF-8 byte limit for total diff. Covers multi-byte char overhead (e.g. Cyrillic = 2 bytes/char). */
  maxTotalDiffBytes?: number;
}

export const CONTEXT_LIMITS = Symbol('CONTEXT_LIMITS');

export const PROVIDER_LIMITS: Record<string, ContextLimits> = {
  openai: {
    maxFiles: 50,
    maxDiffCharsPerFile: 10_000,
    maxTotalDiffChars: 100_000,
  },
  amvera: {
    maxFiles: 20,
    maxDiffCharsPerFile: 4_000,
    maxTotalDiffChars: 12_000,
    maxTotalDiffBytes: 13_000,
  },
};
