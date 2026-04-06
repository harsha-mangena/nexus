import * as p from '@clack/prompts';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

type ChannelKey = 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'cli';
type ProviderKey = 'openai' | 'gemini' | 'ollama';
type RoutingStrategy = 'cost-optimized' | 'quality-optimized' | 'local-only';

interface TelegramCredentials {
  BOT_TOKEN: string;
}

interface DiscordCredentials {
  BOT_TOKEN: string;
  APPLICATION_ID: string;
}

interface SlackCredentials {
  BOT_TOKEN: string;
  APP_TOKEN: string;
  SIGNING_SECRET: string;
}

interface WhatsAppCredentials {
  WAHA_URL: string;
}

interface OpenAICredentials {
  OPENAI_API_KEY: string;
}

interface GeminiCredentials {
  GOOGLE_GENERATIVE_AI_API_KEY: string;
}

interface OllamaCredentials {
  OLLAMA_BASE_URL: string;
}

type ChannelCredentials =
  | TelegramCredentials
  | DiscordCredentials
  | SlackCredentials
  | WhatsAppCredentials
  | Record<string, never>;

type ProviderCredentials = OpenAICredentials | GeminiCredentials | OllamaCredentials;

function cancelAndExit(): never {
  p.cancel('Setup cancelled. No files were written.');
  process.exit(0);
}

async function askText(opts: Parameters<typeof p.text>[0]): Promise<string> {
  const result = await p.text(opts);
  if (p.isCancel(result)) cancelAndExit();
  return result as string;
}

async function askSelect<T extends string>(opts: Parameters<typeof p.select>[0]): Promise<T> {
  const result = await p.select(opts);
  if (p.isCancel(result)) cancelAndExit();
  return result as T;
}

async function askMultiselect<T extends string>(opts: Parameters<typeof p.multiselect>[0]): Promise<T[]> {
  const result = await p.multiselect(opts);
  if (p.isCancel(result)) cancelAndExit();
  return result as T[];
}

async function askConfirm(opts: Parameters<typeof p.confirm>[0]): Promise<boolean> {
  const result = await p.confirm(opts);
  if (p.isCancel(result)) cancelAndExit();
  return result as boolean;
}

async function collectChannelCredentials(
  channel: ChannelKey
): Promise<ChannelCredentials> {
  switch (channel) {
    case 'telegram': {
      const BOT_TOKEN = await askText({
        message: 'Telegram BOT_TOKEN:',
        validate: (v) => (!v ? 'BOT_TOKEN is required' : undefined),
      });
      return { BOT_TOKEN };
    }
    case 'discord': {
      const BOT_TOKEN = await askText({
        message: 'Discord BOT_TOKEN:',
        validate: (v) => (!v ? 'BOT_TOKEN is required' : undefined),
      });
      const APPLICATION_ID = await askText({
        message: 'Discord APPLICATION_ID:',
        validate: (v) => (!v ? 'APPLICATION_ID is required' : undefined),
      });
      return { BOT_TOKEN, APPLICATION_ID };
    }
    case 'slack': {
      const BOT_TOKEN = await askText({
        message: 'Slack BOT_TOKEN:',
        validate: (v) => (!v ? 'BOT_TOKEN is required' : undefined),
      });
      const APP_TOKEN = await askText({
        message: 'Slack APP_TOKEN:',
        validate: (v) => (!v ? 'APP_TOKEN is required' : undefined),
      });
      const SIGNING_SECRET = await askText({
        message: 'Slack SIGNING_SECRET:',
        validate: (v) => (!v ? 'SIGNING_SECRET is required' : undefined),
      });
      return { BOT_TOKEN, APP_TOKEN, SIGNING_SECRET };
    }
    case 'whatsapp': {
      const WAHA_URL = await askText({
        message: 'WhatsApp WAHA_URL:',
        placeholder: 'http://localhost:3001',
        defaultValue: 'http://localhost:3001',
      });
      return { WAHA_URL };
    }
    case 'cli':
      return {};
    default:
      return {};
  }
}

async function collectProviderCredentials(
  provider: ProviderKey
): Promise<ProviderCredentials> {
  switch (provider) {
    case 'openai': {
      const OPENAI_API_KEY = await askText({
        message: 'OpenAI OPENAI_API_KEY:',
        validate: (v) => (!v ? 'OPENAI_API_KEY is required' : undefined),
      });
      return { OPENAI_API_KEY };
    }
    case 'gemini': {
      const GOOGLE_GENERATIVE_AI_API_KEY = await askText({
        message: 'Google Gemini GOOGLE_GENERATIVE_AI_API_KEY:',
        validate: (v) => (!v ? 'GOOGLE_GENERATIVE_AI_API_KEY is required' : undefined),
      });
      return { GOOGLE_GENERATIVE_AI_API_KEY };
    }
    case 'ollama': {
      const OLLAMA_BASE_URL = await askText({
        message: 'Ollama OLLAMA_BASE_URL:',
        placeholder: 'http://localhost:11434',
        defaultValue: 'http://localhost:11434',
      });
      return { OLLAMA_BASE_URL };
    }
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function routingStrategyDefaultProvider(
  strategy: RoutingStrategy,
  availableProviders: ProviderKey[]
): string {
  // Map wizard provider keys to config provider keys (gemini → google)
  const toConfigKey = (key: ProviderKey): string => key === 'gemini' ? 'google' : key;

  switch (strategy) {
    case 'cost-optimized':
      if (availableProviders.includes('gemini')) return toConfigKey('gemini');
      if (availableProviders.includes('ollama')) return toConfigKey('ollama');
      return toConfigKey(availableProviders[0] ?? 'openai' as ProviderKey);
    case 'quality-optimized':
      if (availableProviders.includes('openai')) return toConfigKey('openai');
      if (availableProviders.includes('gemini')) return toConfigKey('gemini');
      return toConfigKey(availableProviders[0] ?? 'openai' as ProviderKey);
    case 'local-only':
      if (availableProviders.includes('ollama')) return toConfigKey('ollama');
      return toConfigKey(availableProviders[0] ?? 'ollama' as ProviderKey);
  }
}

function buildEnvContent(
  assistantName: string,
  channels: ChannelKey[],
  channelCreds: Map<ChannelKey, ChannelCredentials>,
  providers: ProviderKey[],
  providerCreds: Map<ProviderKey, ProviderCredentials>,
  voiceEnabled: boolean,
  whisperUrl: string,
  piperUrl: string
): string {
  const lines: string[] = [
    '# Nexus configuration — generated by nexus-setup',
    '',
    `ASSISTANT_NAME=${assistantName}`,
    '',
  ];

  if (channels.length > 0) {
    lines.push('# Channels');
    for (const ch of channels) {
      const creds = channelCreds.get(ch) ?? {};
      for (const [key, val] of Object.entries(creds)) {
        const envKey = ch === 'whatsapp' ? key : `${ch.toUpperCase()}_${key}`;
        lines.push(`${envKey}=${val}`);
      }
    }
    lines.push('');
  }

  if (providers.length > 0) {
    lines.push('# LLM Providers');
    for (const prov of providers) {
      const creds = providerCreds.get(prov) ?? {};
      for (const [key, val] of Object.entries(creds)) {
        lines.push(`${key}=${val}`);
      }
    }
    lines.push('');
  }

  if (voiceEnabled) {
    lines.push('# Voice');
    lines.push(`WHISPER_URL=${whisperUrl}`);
    lines.push(`PIPER_URL=${piperUrl}`);
    lines.push('');
  }

  return lines.join('\n');
}

interface NexusYamlConfig {
  assistant: {
    name: string;
  };
  channels: Record<string, { enabled: boolean; [key: string]: unknown }>;
  providers: Record<string, { enabled: boolean; [key: string]: unknown }>;
  routing: {
    strategy: RoutingStrategy;
    defaultProvider: string;
  };
  voice: {
    enabled: boolean;
    whisperUrl?: string;
    piperUrl?: string;
  };
}

function buildYamlConfig(
  assistantName: string,
  channels: ChannelKey[],
  channelCreds: Map<ChannelKey, ChannelCredentials>,
  providers: ProviderKey[],
  providerCreds: Map<ProviderKey, ProviderCredentials>,
  routingStrategy: RoutingStrategy,
  defaultProvider: string,
  voiceEnabled: boolean,
  whisperUrl: string,
  piperUrl: string
): NexusYamlConfig {
  const channelsConfig: NexusYamlConfig['channels'] = {};
  for (const ch of channels) {
    const creds = channelCreds.get(ch) ?? {};
    const entry: { enabled: boolean; [key: string]: unknown } = { enabled: true };

    if (ch === 'telegram') {
      entry['botToken'] = '${TELEGRAM_BOT_TOKEN}';
    } else if (ch === 'discord') {
      entry['botToken'] = '${DISCORD_BOT_TOKEN}';
      entry['applicationId'] = '${DISCORD_APPLICATION_ID}';
    } else if (ch === 'slack') {
      entry['botToken'] = '${SLACK_BOT_TOKEN}';
      entry['appToken'] = '${SLACK_APP_TOKEN}';
      entry['signingSecret'] = '${SLACK_SIGNING_SECRET}';
    } else if (ch === 'whatsapp') {
      const wa = creds as WhatsAppCredentials;
      entry['wahaUrl'] = wa.WAHA_URL || 'http://localhost:3001';
    }
    // cli has no extra config
    channelsConfig[ch] = entry;
  }

  const providersConfig: NexusYamlConfig['providers'] = {};
  for (const prov of providers) {
    const configKey = prov === 'gemini' ? 'google' : prov;
    const entry: { enabled: boolean; [key: string]: unknown } = { enabled: true };
    if (prov === 'openai') {
      entry['apiKey'] = '${OPENAI_API_KEY}';
    } else if (prov === 'gemini') {
      entry['apiKey'] = '${GOOGLE_GENERATIVE_AI_API_KEY}';
    } else if (prov === 'ollama') {
      const ol = providerCreds.get('ollama') as OllamaCredentials | undefined;
      entry['baseUrl'] = ol?.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    }
    providersConfig[configKey] = entry;
  }

  const voiceConfig: NexusYamlConfig['voice'] = { enabled: voiceEnabled };
  if (voiceEnabled) {
    voiceConfig.whisperUrl = whisperUrl;
    voiceConfig.piperUrl = piperUrl;
  }

  return {
    assistant: { name: assistantName },
    channels: channelsConfig,
    providers: providersConfig,
    routing: {
      strategy: routingStrategy,
      defaultProvider,
    },
    voice: voiceConfig,
  };
}

export async function runWizard(): Promise<void> {
  p.intro('🤖 Welcome to Nexus Setup');

  // 1. Assistant name
  const assistantName = await askText({
    message: 'What should your assistant be called?',
    placeholder: 'Nexus',
    defaultValue: 'Nexus',
  });

  // 2. Channels
  const selectedChannels = await askMultiselect<ChannelKey>({
    message: 'Which channels do you want to enable?',
    options: [
      { value: 'telegram', label: 'Telegram' },
      { value: 'discord', label: 'Discord' },
      { value: 'slack', label: 'Slack' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'cli', label: 'CLI' },
    ],
    required: false,
  });

  // 3. Channel credentials
  const channelCreds = new Map<ChannelKey, ChannelCredentials>();
  for (const ch of selectedChannels) {
    if (ch !== 'cli') {
      p.log.step(`Configure ${ch.charAt(0).toUpperCase() + ch.slice(1)} credentials`);
    }
    const creds = await collectChannelCredentials(ch);
    channelCreds.set(ch, creds);
  }

  // 4. LLM providers
  const selectedProviders = await askMultiselect<ProviderKey>({
    message: 'Which LLM providers do you want to use?',
    options: [
      { value: 'openai', label: 'OpenAI' },
      { value: 'gemini', label: 'Google Gemini' },
      { value: 'ollama', label: 'Ollama (local)' },
    ],
    required: false,
  });

  // 5. Provider credentials
  const providerCreds = new Map<ProviderKey, ProviderCredentials>();
  for (const prov of selectedProviders) {
    p.log.step(`Configure ${prov.charAt(0).toUpperCase() + prov.slice(1)} credentials`);
    const creds = await collectProviderCredentials(prov);
    providerCreds.set(prov, creds);
  }

  // 6. Routing strategy
  const routingStrategy = await askSelect<RoutingStrategy>({
    message: 'Which routing strategy should Nexus use by default?',
    options: [
      {
        value: 'cost-optimized',
        label: 'Cost-optimized',
        hint: 'Prefers cheaper models (Gemini → Ollama → OpenAI)',
      },
      {
        value: 'quality-optimized',
        label: 'Quality-optimized',
        hint: 'Prefers highest-quality models (OpenAI → Gemini → Ollama)',
      },
      {
        value: 'local-only',
        label: 'Local-only',
        hint: 'Only uses locally-hosted models (Ollama)',
      },
    ],
  });

  const defaultProvider = routingStrategyDefaultProvider(routingStrategy, selectedProviders);

  // 7. Voice
  const voiceEnabled = await askConfirm({
    message: 'Enable voice support (speech-to-text and text-to-speech)?',
    initialValue: false,
  });

  let whisperUrl = '';
  let piperUrl = '';
  if (voiceEnabled) {
    whisperUrl = await askText({
      message: 'Whisper STT service URL:',
      placeholder: 'http://localhost:3002',
      defaultValue: 'http://localhost:3002',
    });
    piperUrl = await askText({
      message: 'Piper TTS service URL:',
      placeholder: 'http://localhost:3003',
      defaultValue: 'http://localhost:3003',
    });
  }

  // 8. Write files
  const spin = p.spinner();
  spin.start('Writing configuration files…');

  const envContent = buildEnvContent(
    assistantName,
    selectedChannels,
    channelCreds,
    selectedProviders,
    providerCreds,
    voiceEnabled,
    whisperUrl,
    piperUrl
  );

  const yamlConfig = buildYamlConfig(
    assistantName,
    selectedChannels,
    channelCreds,
    selectedProviders,
    providerCreds,
    routingStrategy,
    defaultProvider,
    voiceEnabled,
    whisperUrl,
    piperUrl
  );

  const cwd = process.cwd();
  const envPath = path.join(cwd, '.env');
  const configDir = path.join(cwd, 'config');
  const yamlPath = path.join(configDir, 'nexus.yaml');

  fs.writeFileSync(envPath, envContent, 'utf8');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(
    yamlPath,
    '# Nexus configuration — generated by nexus-setup\n' + yaml.dump(yamlConfig, { indent: 2 }),
    'utf8'
  );

  spin.stop('Configuration files written.');

  p.note(
    [
      `  .env         → ${envPath}`,
      `  nexus.yaml   → ${yamlPath}`,
    ].join('\n'),
    'Files created'
  );

  p.outro("✅ Setup complete! Run 'pnpm start' or 'docker compose up'");
}
