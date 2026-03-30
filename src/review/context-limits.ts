export interface ContextLimits {
  maxFiles: number;
  maxDiffCharsPerFile: number;
  maxTotalDiffChars: number;
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
  },
};
