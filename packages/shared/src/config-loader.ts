import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { nexusConfigSchema, type ValidatedNexusConfig } from './schemas.js';
import type { NexusConfig } from './types.js';
import { ConfigError } from './errors.js';
import { logger } from './logger.js';

let currentConfig: NexusConfig | null = null;
let configWatcher: fs.FSWatcher | null = null;

export function loadConfig(configPath?: string): NexusConfig {
  const resolvedPath = configPath ?? process.env['CONFIG_PATH'] ?? './config/nexus.yaml';
  const absolutePath = path.resolve(resolvedPath);

  if (!fs.existsSync(absolutePath)) {
    logger.warn(`Config file not found at ${absolutePath}, using defaults with env vars`);
    return buildConfigFromEnv();
  }

  try {
    const raw = fs.readFileSync(absolutePath, 'utf-8');
    const parsed = yaml.load(raw) as Record<string, unknown>;
    const resolved = resolveEnvVars(parsed) as Record<string, unknown>;
    stripEmptyProviders(resolved);
    const merged = mergeWithEnv(resolved);
    const validated = nexusConfigSchema.parse(merged) as unknown as NexusConfig;
    currentConfig = validated;
    logger.info(`Configuration loaded from ${absolutePath}`);
    return validated;
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      throw new ConfigError(`Invalid configuration: ${err.message}`);
    }
    throw new ConfigError(`Failed to load config from ${absolutePath}: ${err}`);
  }
}

export function getConfig(): NexusConfig {
  if (!currentConfig) {
    throw new ConfigError('Configuration not loaded. Call loadConfig() first.');
  }
  return currentConfig;
}

export function watchConfig(configPath: string, onReload: (config: NexusConfig) => void): void {
  const absolutePath = path.resolve(configPath);
  if (configWatcher) {
    configWatcher.close();
  }

  configWatcher = fs.watch(absolutePath, (eventType) => {
    if (eventType === 'change') {
      logger.info('Config file changed, reloading...');
      try {
        const newConfig = loadConfig(absolutePath);
        onReload(newConfig);
        logger.info('Config reloaded successfully');
      } catch (err) {
        logger.error({ err }, 'Failed to reload config');
      }
    }
  });
}

export function stopWatchingConfig(): void {
  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
  }
}

function buildConfigFromEnv(): NexusConfig {
  const raw: Record<string, unknown> = {
    providers: {},
  };

  const providers: Record<string, unknown> = {};

  if (process.env['OPENAI_API_KEY']) {
    providers['openai'] = { apiKey: process.env['OPENAI_API_KEY'] };
  }
  if (process.env['GOOGLE_GENERATIVE_AI_API_KEY']) {
    providers['google'] = { apiKey: process.env['GOOGLE_GENERATIVE_AI_API_KEY'] };
  }
  if (process.env['OLLAMA_BASE_URL']) {
    providers['ollama'] = { baseUrl: process.env['OLLAMA_BASE_URL'] };
  }

  // Ensure at least one provider — default to ollama
  if (Object.keys(providers).length === 0) {
    providers['ollama'] = { baseUrl: 'http://localhost:11434' };
  }

  raw['providers'] = providers;

  const channels: Record<string, unknown> = {};
  if (process.env['TELEGRAM_BOT_TOKEN']) {
    channels['telegram'] = { enabled: true, botToken: process.env['TELEGRAM_BOT_TOKEN'] };
  }
  if (process.env['DISCORD_BOT_TOKEN']) {
    channels['discord'] = {
      enabled: true,
      botToken: process.env['DISCORD_BOT_TOKEN'],
      applicationId: process.env['DISCORD_APPLICATION_ID'],
    };
  }
  if (process.env['SLACK_BOT_TOKEN']) {
    channels['slack'] = {
      enabled: true,
      botToken: process.env['SLACK_BOT_TOKEN'],
      appToken: process.env['SLACK_APP_TOKEN'],
      signingSecret: process.env['SLACK_SIGNING_SECRET'],
    };
  }
  if (process.env['WAHA_URL']) {
    channels['whatsapp'] = { enabled: true, wahaUrl: process.env['WAHA_URL'] };
  }
  raw['channels'] = channels;

  // Routing defaults
  const defaultProvider = process.env['OPENAI_API_KEY']
    ? 'openai'
    : process.env['GOOGLE_GENERATIVE_AI_API_KEY']
      ? 'google'
      : 'ollama';
  raw['routing'] = { defaultProvider };

  // Memory
  raw['memory'] = {
    dbPath: process.env['MEMORY_DB_PATH'] ?? './data/nexus.db',
    maxContextTurns: parseInt(process.env['MEMORY_MAX_CONTEXT_TURNS'] ?? '20', 10),
  };

  // Voice
  if (process.env['WHISPER_URL'] || process.env['PIPER_URL']) {
    raw['voice'] = {
      whisperUrl: process.env['WHISPER_URL'],
      piperUrl: process.env['PIPER_URL'],
    };
  }

  // Security
  raw['security'] = {
    rateLimitPerMinute: parseInt(process.env['RATE_LIMIT_PER_MINUTE'] ?? '30', 10),
  };

  const validated = nexusConfigSchema.parse(raw) as unknown as NexusConfig;
  currentConfig = validated;
  return validated;
}

function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, varName) => process.env[varName] ?? '');
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result;
  }
  return obj;
}

function stripEmptyProviders(config: Record<string, unknown>): void {
  const providers = config['providers'] as Record<string, Record<string, unknown>> | undefined;
  if (!providers) return;
  for (const [key, value] of Object.entries(providers)) {
    if (value && typeof value === 'object' && 'apiKey' in value && value['apiKey'] === '') {
      delete providers[key];
    }
  }
}

function mergeWithEnv(parsed: Record<string, unknown>): Record<string, unknown> {
  const result = { ...parsed };

  // Override provider keys from env
  const providers = (result['providers'] as Record<string, Record<string, unknown>> | undefined) ?? {};

  if (process.env['OPENAI_API_KEY']) {
    providers['openai'] = { ...providers['openai'], apiKey: process.env['OPENAI_API_KEY'] };
  }
  if (process.env['GOOGLE_GENERATIVE_AI_API_KEY']) {
    providers['google'] = { ...providers['google'], apiKey: process.env['GOOGLE_GENERATIVE_AI_API_KEY'] };
  }
  if (process.env['OLLAMA_BASE_URL']) {
    providers['ollama'] = { ...providers['ollama'], baseUrl: process.env['OLLAMA_BASE_URL'] };
  }

  result['providers'] = providers;

  // Override channel tokens from env
  const channels = (result['channels'] as Record<string, Record<string, unknown>> | undefined) ?? {};
  if (process.env['TELEGRAM_BOT_TOKEN'] && channels['telegram']) {
    channels['telegram']['botToken'] = process.env['TELEGRAM_BOT_TOKEN'];
  }
  if (process.env['DISCORD_BOT_TOKEN'] && channels['discord']) {
    channels['discord']['botToken'] = process.env['DISCORD_BOT_TOKEN'];
  }
  if (process.env['SLACK_BOT_TOKEN'] && channels['slack']) {
    channels['slack']['botToken'] = process.env['SLACK_BOT_TOKEN'];
    if (process.env['SLACK_APP_TOKEN']) channels['slack']['appToken'] = process.env['SLACK_APP_TOKEN'];
    if (process.env['SLACK_SIGNING_SECRET']) channels['slack']['signingSecret'] = process.env['SLACK_SIGNING_SECRET'];
  }
  result['channels'] = channels;

  return result;
}
