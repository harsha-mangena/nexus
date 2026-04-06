import type { IntentCategory, ModelRoute, NexusConfig } from '@nexus/shared';
import { createChildLogger } from '@nexus/shared';
import { DEFAULT_ROUTES } from './routes.js';

const logger = createChildLogger('model-selector');

const PROVIDER_FALLBACK_ORDER: Array<'openai' | 'google' | 'ollama'> = ['openai', 'google', 'ollama'];

export class ModelSelector {
  private config: NexusConfig;

  constructor(config: NexusConfig) {
    this.config = config;
  }

  updateConfig(config: NexusConfig): void {
    this.config = config;
  }

  selectModel(intent: IntentCategory): ModelRoute {
    const availableProviders = this.getAvailableProviders();
    const fallbackPolicy = this.config.routing.fallbackPolicy ?? 'warn';

    // First: check config routing rules for this intent
    const configRule = this.config.routing.rules.find((rule) => rule.intent === intent);
    if (configRule) {
      const provider = configRule.provider;
      if (availableProviders.includes(provider)) {
        // Look up supportsTools from the matching DEFAULT_ROUTES entry, or default based on intent
        const defaultRoute = DEFAULT_ROUTES.find((r) => r.intent === intent);
        const toolIntents: IntentCategory[] = ['CODE', 'AGENTIC', 'ANALYSIS'];
        const supportsTools = defaultRoute?.supportsTools ?? toolIntents.includes(intent);

        return {
          intent,
          provider,
          model: configRule.model,
          maxTokens: configRule.maxTokens ?? 2048,
          temperature: configRule.temperature ?? 0.7,
          supportsTools,
          costTier: 'medium',
        };
      }
    }

    // Second: look up DEFAULT_ROUTES for this intent
    const defaultRoute = DEFAULT_ROUTES.find((route) => route.intent === intent);
    if (defaultRoute) {
      if (availableProviders.includes(defaultRoute.provider)) {
        return defaultRoute;
      }

      // Provider from DEFAULT_ROUTES is unavailable; apply fallback logic
      this.applyFallbackPolicy(fallbackPolicy, intent, defaultRoute.provider);

      // Use configured defaultProvider first, then fallback order
      const orderedProviders = [
        this.config.routing.defaultProvider,
        ...PROVIDER_FALLBACK_ORDER.filter(p => p !== this.config.routing.defaultProvider),
      ];
      for (const fallbackProvider of orderedProviders) {
        if (availableProviders.includes(fallbackProvider)) {
          return {
            ...defaultRoute,
            provider: fallbackProvider,
            model: this.getDefaultModelForProvider(fallbackProvider),
          };
        }
      }
    }

    // Last resort: use configured defaultProvider, then fallback order
    const orderedProviders = [
      this.config.routing.defaultProvider,
      ...PROVIDER_FALLBACK_ORDER.filter(p => p !== this.config.routing.defaultProvider),
    ];
    for (const fallbackProvider of orderedProviders) {
      if (availableProviders.includes(fallbackProvider)) {
        return {
          intent,
          provider: fallbackProvider,
          model: this.getDefaultModelForProvider(fallbackProvider),
          maxTokens: 1024,
          temperature: 0.7,
          supportsTools: false,
          costTier: 'low',
        };
      }
    }

    // No providers configured; return SIMPLE default route as a safe fallback
    return DEFAULT_ROUTES.find((r) => r.intent === 'SIMPLE') as ModelRoute;
  }

  private applyFallbackPolicy(
    policy: 'allow' | 'warn' | 'deny',
    intent: IntentCategory,
    originalProvider: string,
  ): void {
    if (policy === 'allow') {
      return; // Silent fallback
    }
    if (policy === 'warn') {
      logger.warn(
        { intent, originalProvider },
        'Provider unavailable, falling back to next available provider',
      );
      return;
    }
    if (policy === 'deny') {
      throw new Error(
        `Provider '${originalProvider}' is unavailable for intent '${intent}' and fallback is denied by policy.`,
      );
    }
  }

  getAvailableProviders(): string[] {
    const providers: string[] = [];
    if (this.config.providers.openai?.apiKey) {
      providers.push('openai');
    }
    if (this.config.providers.google?.apiKey) {
      providers.push('google');
    }
    if (this.config.providers.ollama?.baseUrl) {
      providers.push('ollama');
    }
    return providers;
  }

  private getDefaultModelForProvider(provider: 'openai' | 'google' | 'ollama'): string {
    switch (provider) {
      case 'openai':
        return this.config.providers.openai?.defaultModel ?? 'gpt-4o';
      case 'google':
        return this.config.providers.google?.defaultModel ?? 'gemini-2.0-flash';
      case 'ollama':
        return this.config.providers.ollama?.defaultModel ?? 'llama3.2';
    }
  }
}
