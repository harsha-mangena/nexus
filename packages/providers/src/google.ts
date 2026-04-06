import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { NexusConfig } from '@nexus/shared';

export function createGoogleProvider(config: NexusConfig) {
  const googleConfig = config.providers.google;
  if (!googleConfig) return null;

  const provider = createGoogleGenerativeAI({
    apiKey: googleConfig.apiKey,
  });

  return {
    name: 'google' as const,
    getModel(modelId?: string) {
      return provider(modelId ?? googleConfig.defaultModel ?? 'gemini-2.0-flash');
    },
  };
}
