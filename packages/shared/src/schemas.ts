import { z } from 'zod';

const channelConfigSchema = z.object({
  enabled: z.boolean().default(false),
}).passthrough();

const openaiProviderSchema = z.object({
  apiKey: z.string().min(1, 'OpenAI API key is required'),
  defaultModel: z.string().optional(),
}).passthrough();

const googleProviderSchema = z.object({
  apiKey: z.string().min(1, 'Google API key is required'),
  defaultModel: z.string().optional(),
}).passthrough();

const ollamaProviderSchema = z.object({
  baseUrl: z.string().url('Ollama base URL must be a valid URL'),
  defaultModel: z.string().optional(),
}).passthrough();

const intentSchema = z.enum(['SIMPLE', 'CODE', 'CREATIVE', 'ANALYSIS', 'AGENTIC', 'VOICE']);
const providerNameSchema = z.enum(['openai', 'google', 'ollama']);

const routingRuleSchema = z.object({
  intent: intentSchema,
  provider: providerNameSchema,
  model: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export const nexusConfigSchema = z.object({
  assistant: z.object({
    name: z.string().min(1).default('Nexus'),
    personaFile: z.string().optional(),
  }).default({ name: 'Nexus' }),

  channels: z.record(z.string(), channelConfigSchema).default({}),

  providers: z.object({
    openai: openaiProviderSchema.optional(),
    google: googleProviderSchema.optional(),
    ollama: ollamaProviderSchema.optional(),
  }).refine(
    (p) => p.openai || p.google || p.ollama,
    { message: 'At least one LLM provider must be configured' }
  ),

  routing: z.object({
    defaultProvider: providerNameSchema.default('openai'),
    rules: z.array(routingRuleSchema).default([]),
  }).default({ defaultProvider: 'openai', rules: [] }),

  memory: z.object({
    dbPath: z.string().default('./data/nexus.db'),
    maxContextTurns: z.number().int().positive().default(20),
  }).default({ dbPath: './data/nexus.db', maxContextTurns: 20 }),

  voice: z.object({
    whisperUrl: z.string().url().optional(),
    piperUrl: z.string().url().optional(),
    defaultVoice: z.string().optional(),
  }).optional(),

  tools: z.object({
    enabled: z.array(z.string()).default(['datetime', 'calculator']),
    allowedPaths: z.array(z.string()).optional(),
  }).default({ enabled: ['datetime', 'calculator'] }),

  security: z.object({
    allowedUserIds: z.record(z.string(), z.array(z.string())).optional(),
    rateLimitPerMinute: z.number().int().positive().default(30),
  }).default({ rateLimitPerMinute: 30 }),
});

export type ValidatedNexusConfig = z.infer<typeof nexusConfigSchema>;
