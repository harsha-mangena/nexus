import type { LanguageModelV1 } from 'ai';
import type { NexusConfig, ModelRoute } from '@nexus/shared';
import { createOpenAIProvider } from './openai.js';
import { createGoogleProvider } from './google.js';
import { createOllamaProvider } from './ollama.js';

type ProviderName = 'openai' | 'google' | 'ollama';

type ProviderWrapper = {
  name: ProviderName;
  getModel(modelId?: string): LanguageModelV1;
};

export class ProviderRegistry {
  private providers: Map<ProviderName, ProviderWrapper>;

  constructor(config: NexusConfig) {
    this.providers = new Map();

    const openai = createOpenAIProvider(config);
    if (openai) this.providers.set('openai', openai as ProviderWrapper);

    const google = createGoogleProvider(config);
    if (google) this.providers.set('google', google as ProviderWrapper);

    const ollama = createOllamaProvider(config);
    if (ollama) this.providers.set('ollama', ollama as ProviderWrapper);
  }

  getProvider(name: ProviderName): ProviderWrapper | null {
    return this.providers.get(name) ?? null;
  }

  getModel(providerName: ProviderName, modelId?: string): LanguageModelV1 | null {
    const provider = this.providers.get(providerName);
    if (!provider) return null;
    return provider.getModel(modelId);
  }

  getAvailableProviders(): ProviderName[] {
    return Array.from(this.providers.keys());
  }

  getModelForRoute(route: ModelRoute): LanguageModelV1 | null {
    const model = this.getModel(route.provider, route.model);
    if (model) return model;

    // Fallback: try any available provider
    for (const providerName of this.providers.keys()) {
      const fallbackModel = this.getModel(providerName);
      if (fallbackModel) return fallbackModel;
    }

    return null;
  }
}
