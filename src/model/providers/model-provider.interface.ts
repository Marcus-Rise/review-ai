export interface ModelProviderRequest {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  jsonMode: boolean;
}

export interface ModelProviderResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ModelProvider {
  complete(request: ModelProviderRequest): Promise<ModelProviderResponse>;
}

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
