import * as fs from 'node:fs';
import {
  loadConfig,
  watchConfig,
  stopWatchingConfig,
  logger,
} from '@nexus/shared';
import type {
  NormalizedMessage,
  OutgoingMessage,
  ChannelConfig,
} from '@nexus/shared';
import { SQLiteStore, ConversationManager } from '@nexus/memory';
import { IntentClassifier, ModelSelector } from '@nexus/router';
import { ProviderRegistry } from '@nexus/providers';
import { ToolRegistry } from '@nexus/tools';
import { WhisperClient, PiperClient, VoicePipeline } from '@nexus/voice';
import { AgentOrchestrator, Gateway, ResponseFormatter } from '@nexus/core';
import {
  CLIAdapter,
  TelegramAdapter,
  DiscordAdapter,
  SlackAdapter,
  WhatsAppAdapter,
} from '@nexus/channels';

async function main(): Promise<void> {
  // 1. Load configuration
  const config = loadConfig();

  // 2. Load persona
  let persona: string;
  if (config.assistant.personaFile) {
    try {
      persona = fs.readFileSync(config.assistant.personaFile, 'utf-8');
      logger.info({ personaFile: config.assistant.personaFile }, 'Loaded persona from file');
    } catch (err) {
      logger.warn({ err, personaFile: config.assistant.personaFile }, 'Failed to read persona file, using default');
      persona = `You are ${config.assistant.name}, a helpful personal AI assistant. You are knowledgeable, friendly, and concise.`;
    }
  } else {
    persona = `You are ${config.assistant.name}, a helpful personal AI assistant. You are knowledgeable, friendly, and concise.`;
  }

  // 3. Set up memory
  const store = new SQLiteStore(config.memory.dbPath);
  const memory = new ConversationManager(store, config.memory.maxContextTurns);

  // 3b. Prune old conversations on startup
  const pruned = store.pruneOldConversations(config.memory.retentionDays);
  if (pruned > 0) {
    logger.info({ pruned }, 'Pruned old conversations');
  }

  // 4. Set up router
  const classifier = new IntentClassifier();
  const modelSelector = new ModelSelector(config);

  // 5. Set up provider registry
  const providers = new ProviderRegistry(config);

  // 6. Set up tool registry
  const tools = ToolRegistry.createDefaultTools(
    config.tools.enabled,
    config.tools.allowedPaths ?? [],
  );

  // 7. Set up voice pipeline
  let whisper: WhisperClient | undefined;
  let piper: PiperClient | undefined;

  if (config.voice?.whisperUrl) {
    whisper = new WhisperClient(config.voice.whisperUrl);
    logger.info({ whisperUrl: config.voice.whisperUrl }, 'WhisperClient initialized');
  }
  if (config.voice?.piperUrl) {
    piper = new PiperClient(config.voice.piperUrl);
    logger.info({ piperUrl: config.voice.piperUrl }, 'PiperClient initialized');
  }

  const voice = new VoicePipeline(whisper, piper);

  // 8. Create agent orchestrator
  const orchestrator = new AgentOrchestrator(providers, tools, memory, voice);

  // 9. Create gateway (with persistent rate limiting via store) and response formatter
  const gateway = new Gateway(config, store);
  const formatter = new ResponseFormatter();

  // 10. Set up channel adapters
  const enabledChannels: string[] = [];

  // Always add CLI adapter
  const cliAdapter = new CLIAdapter();
  const cliConfig: ChannelConfig = { enabled: true };
  await cliAdapter.initialize(cliConfig);
  cliAdapter.onReset(async (userId, channel) => {
    memory.resetConversation(userId, channel);
    logger.info({ userId, channel }, 'Conversation reset via CLI');
  });
  gateway.registerAdapter(cliAdapter);
  enabledChannels.push('cli');

  // Add Telegram if configured and enabled
  const telegramConfig = config.channels['telegram'];
  if (telegramConfig?.enabled) {
    const isRequired = (telegramConfig as Record<string, unknown>)['required'] === true;
    const telegramAdapter = new TelegramAdapter();
    await telegramAdapter.initialize(telegramConfig);
    gateway.registerAdapter(telegramAdapter, isRequired);
    enabledChannels.push('telegram');
  }

  // Add Discord if configured and enabled
  const discordConfig = config.channels['discord'];
  if (discordConfig?.enabled) {
    const isRequired = (discordConfig as Record<string, unknown>)['required'] === true;
    const discordAdapter = new DiscordAdapter();
    await discordAdapter.initialize(discordConfig);
    gateway.registerAdapter(discordAdapter, isRequired);
    enabledChannels.push('discord');
  }

  // Add Slack if configured and enabled
  const slackConfig = config.channels['slack'];
  if (slackConfig?.enabled) {
    const isRequired = (slackConfig as Record<string, unknown>)['required'] === true;
    const slackAdapter = new SlackAdapter();
    await slackAdapter.initialize(slackConfig);
    gateway.registerAdapter(slackAdapter, isRequired);
    enabledChannels.push('slack');
  }

  // Add WhatsApp if configured and enabled
  const whatsappConfig = config.channels['whatsapp'];
  if (whatsappConfig?.enabled) {
    const isRequired = (whatsappConfig as Record<string, unknown>)['required'] === true;
    const whatsAppAdapter = new WhatsAppAdapter();
    await whatsAppAdapter.initialize(whatsappConfig);
    gateway.registerAdapter(whatsAppAdapter, isRequired);
    enabledChannels.push('whatsapp');
  }

  // 11. Set the gateway processor
  gateway.setProcessor(async (message: NormalizedMessage): Promise<OutgoingMessage> => {
    // Classify intent
    const hasVoice = message.attachments.some((a) => a.type === 'voice' || a.type === 'audio');
    const classification = classifier.classify(message.text, hasVoice);

    // Select model based on intent
    const route = modelSelector.selectModel(classification.intent);

    // Process message through orchestrator
    const result = await orchestrator.process(message, route, persona);

    // Format response for the channel
    const outgoing = formatter.formatForChannel(result.text, message.channel);

    // Build attachments if TTS audio is present
    const attachments: OutgoingMessage['attachments'] = [];
    if (result.audio) {
      attachments.push({
        type: 'audio',
        buffer: result.audio,
        mimeType: result.audioMimeType ?? 'audio/wav',
        fileName: 'response.wav',
      });
    }

    return {
      text: outgoing,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  });

  // 12. Start gateway (all adapters)
  await gateway.startAll();

  // 13. Log startup info
  const availableProviders = providers.getAvailableProviders();
  logger.info(
    {
      name: config.assistant.name,
      enabledChannels,
      availableProviders,
    },
    'Nexus started',
  );

  // 14. Graceful shutdown handlers
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received, shutting down...');
    try {
      await gateway.stopAll();
      store.close();
      stopWatchingConfig();
      logger.info('Nexus stopped cleanly');
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
    } finally {
      process.exit(0);
    }
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // 15. Watch for config changes (hot-reload routing + security)
  const configPath = process.env['CONFIG_PATH'] ?? './config/nexus.yaml';
  watchConfig(configPath, (newConfig) => {
    logger.info('Applying hot-reloaded configuration');
    modelSelector.updateConfig(newConfig);
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
