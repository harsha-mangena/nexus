import { createOpenAI } from '@ai-sdk/openai';
import type { NexusConfig } from '@nexus/shared';

export function createOpenAIProvider(config: NexusConfig) {
  const openaiConfig = config.providers.openai;
  if (!openaiConfig) return null;

  const provider = createOpenAI({
    apiKey: openaiConfig.apiKey,
  });

  return {
    name: 'openai' as const,
    getModel(modelId?: string) {
      return provider(modelId ?? openaiConfig.defaultModel ?? 'gpt-4o');
    },
  };
}
