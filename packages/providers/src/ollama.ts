import { createOllama } from 'ollama-ai-provider';
import type { NexusConfig } from '@nexus/shared';

export function createOllamaProvider(config: NexusConfig) {
  const ollamaConfig = config.providers.ollama;
  if (!ollamaConfig) return null;

  // The ollama-ai-provider SDK expects baseURL to end with /api
  // User config stores the base URL (e.g. http://localhost:11434)
  const baseUrl = ollamaConfig.baseUrl.replace(/\/+$/, '');
  const provider = createOllama({
    baseURL: baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`,
  });

  return {
    name: 'ollama' as const,
    getModel(modelId?: string) {
      return provider(modelId ?? ollamaConfig.defaultModel ?? 'llama3.2');
    },
  };
}
