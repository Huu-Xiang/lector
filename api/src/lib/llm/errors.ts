export class LLMTruncatedError extends Error {
  constructor(
    readonly maxTokens: number,
    readonly canIncreaseBudget: boolean = true,
  ) {
    super(`LLM response reached the ${maxTokens}-token output limit`);
    this.name = 'LLMTruncatedError';
  }
}

export class LLMInvalidJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMInvalidJsonError';
  }
}

/** The provider's moderation refused the input, e.g. Alibaba Bailian `data_inspection_failed`. */
export class LLMContentFilterError extends Error {
  constructor() {
    super('The AI provider declined this text');
    this.name = 'LLMContentFilterError';
  }
}

const CONTENT_FILTER_CODES = ['data_inspection_failed'];

export function providerError(detail: string): Error {
  return CONTENT_FILTER_CODES.some((code) => detail.includes(code))
    ? new LLMContentFilterError()
    : new Error(`LLM provider error: ${detail}`);
}
