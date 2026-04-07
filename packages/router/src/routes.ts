import type { ModelRoute } from '@nexus/shared';

export const DEFAULT_ROUTES: ModelRoute[] = [
  {
    intent: 'SIMPLE',
    provider: 'google',
    model: 'gemini-2.0-flash',
    maxTokens: 1024,
    temperature: 0.7,
    supportsTools: true,   // Must be true — the model needs tools for real-time info, web search, etc.
    costTier: 'low',
  },
  {
    intent: 'CODE',
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.2,
    supportsTools: true,
    costTier: 'high',
  },
  {
    intent: 'CREATIVE',
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 2048,
    temperature: 0.9,
    supportsTools: true,   // Creative tasks may still need web search for research
    costTier: 'high',
  },
  {
    intent: 'ANALYSIS',
    provider: 'google',
    model: 'gemini-2.0-pro-exp',
    maxTokens: 4096,
    temperature: 0.4,
    supportsTools: true,
    costTier: 'medium',
  },
  {
    intent: 'AGENTIC',
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: 4096,
    temperature: 0.3,
    supportsTools: true,
    costTier: 'high',
  },
  {
    intent: 'VOICE',
    provider: 'ollama',
    model: 'llama3.2',
    maxTokens: 512,
    temperature: 0.5,
    supportsTools: true,   // Voice queries may need search/tools
    costTier: 'free',
  },
];
