import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { nexusConfigSchema, type ValidatedNexusConfig } from './schemas.js';
import type { NexusConfig } from './types.js';
import { ConfigError } from './errors.js';
import { logger } from './logger.js';

let currentConfig: NexusConfig | null = null;
let configWatcher: fs.FSWatcher | null = null;
const DEFAULT_CONFIG_PATH = './config/nexus.yaml';
const SEARCH_MAX_DEPTH = 8;

export function loadConfig(configPath?: string): NexusConfig {
  // Load nearest .env first so CONFIG_PATH/provider keys are available before resolving config.
  loadNearestEnv(process.cwd());

  const resolvedPath = configPath ?? process.env['CONFIG_PATH'] ?? DEFAULT_CONFIG_PATH;
  const absolutePath = resolveExistingPath(resolvedPath) ?? path.resolve(resolvedPath);

  // Load nearest .env around the config file path as a second chance.
  loadNearestEnv(path.dirname(absolutePath));

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
    const workspaceRoot = findWorkspaceRoot(path.dirname(absolutePath)) ?? process.cwd();
    const normalized = normalizeConfigPaths(validated, workspaceRoot);
    currentConfig = normalized;
    logger.info(`Configuration loaded from ${absolutePath}`);
    return normalized;
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
  const absolutePath = resolveExistingPath(configPath) ?? path.resolve(configPath);
  if (configWatcher) {
    configWatcher.close();
  }

  if (!fs.existsSync(absolutePath)) {
    logger.warn({ absolutePath }, 'Config file not found; hot-reload watcher disabled');
    return;
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
  const workspaceRoot = findWorkspaceRoot(process.cwd()) ?? process.cwd();
  const normalized = normalizeConfigPaths(validated, workspaceRoot);
  currentConfig = normalized;
  return normalized;
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

function resolveExistingPath(targetPath: string, fromDir: string = process.cwd()): string | null {
  if (path.isAbsolute(targetPath)) {
    return fs.existsSync(targetPath) ? targetPath : null;
  }

  let currentDir = fromDir;
  for (let i = 0; i <= SEARCH_MAX_DEPTH; i++) {
    const candidate = path.resolve(currentDir, targetPath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return null;
}

function loadNearestEnv(fromDir: string): void {
  const envPath = resolveExistingPath('.env', fromDir);
  if (!envPath) return;
  loadEnvFile(envPath);
}

function loadEnvFile(envPath: string): void {
  try {
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      if (!key || process.env[key] !== undefined) continue;

      let value = match[2] ?? '';
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (err) {
    logger.warn({ err, envPath }, 'Failed to load .env file');
  }
}

function findWorkspaceRoot(startDir: string): string | null {
  let currentDir = startDir;
  for (let i = 0; i <= SEARCH_MAX_DEPTH + 4; i++) {
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  return null;
}

function normalizeConfigPaths(config: NexusConfig, baseDir: string): NexusConfig {
  const personaFile = config.assistant.personaFile
    ? (path.isAbsolute(config.assistant.personaFile)
      ? config.assistant.personaFile
      : path.resolve(baseDir, config.assistant.personaFile))
    : undefined;

  const dbPath = path.isAbsolute(config.memory.dbPath)
    ? config.memory.dbPath
    : path.resolve(baseDir, config.memory.dbPath);

  const allowedPaths = config.tools.allowedPaths?.map((allowedPath) => (
    path.isAbsolute(allowedPath) ? allowedPath : path.resolve(baseDir, allowedPath)
  ));

  return {
    ...config,
    assistant: {
      ...config.assistant,
      personaFile,
    },
    memory: {
      ...config.memory,
      dbPath,
    },
    tools: {
      ...config.tools,
      allowedPaths,
    },
  };
}
