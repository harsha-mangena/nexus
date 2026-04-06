import { createOllama } from 'ollama-ai-provider';
import type { NexusConfig } from '@nexus/shared';

export function createOllamaProvider(config: NexusConfig) {
  const ollamaConfig = config.providers.ollama;
  if (!ollamaConfig) return null;

  const provider = createOllama({
    baseURL: ollamaConfig.baseUrl + '/api',
  });

  return {
    name: 'ollama' as const,
    getModel(modelId?: string) {
      return provider(modelId ?? ollamaConfig.defaultModel ?? 'llama3.2');
    },
  };
}
