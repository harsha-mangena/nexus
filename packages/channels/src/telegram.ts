import { Telegraf } from 'telegraf';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, NormalizedMessage, OutgoingMessage } from '@nexus/shared';
import { BaseAdapter } from './base-adapter.js';

interface TelegramConfig extends ChannelConfig {
  botToken: string;
}

export class TelegramAdapter extends BaseAdapter {
  readonly name = 'telegram' as const;
  private bot?: Telegraf;

  async initialize(config: ChannelConfig): Promise<void> {
    const telegramConfig = config as TelegramConfig;
    this.bot = new Telegraf(telegramConfig.botToken);
    this.logger.info('Telegram adapter initialized');
  }

  async start(): Promise<void> {
    if (!this.bot) {
      throw new Error('TelegramAdapter not initialized');
    }

    this.bot.on('text', async (ctx) => {
      const msg = ctx.message;
      const normalized: NormalizedMessage = {
        id: randomUUID(),
        channel: 'telegram',
        channelMessageId: String(msg.message_id),
        userId: String(msg.from?.id ?? 'unknown'),
        userName: msg.from?.username ?? msg.from?.first_name ?? 'unknown',
        text: msg.text,
        attachments: [],
        replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
        timestamp: new Date(msg.date * 1000),
        raw: msg,
      };
      await this.handleIncoming(normalized);
    });

    this.bot.on('voice', async (ctx) => {
      const msg = ctx.message;
      const voice = msg.voice;

      let voiceBuffer: Buffer | undefined;
      try {
        const fileLink = await ctx.telegram.getFileLink(voice.file_id);
        const response = await fetch(fileLink.href);
        const arrayBuffer = await response.arrayBuffer();
        voiceBuffer = Buffer.from(arrayBuffer);
      } catch (err) {
        this.logger.error({ err }, 'Failed to download voice message');
      }

      const normalized: NormalizedMessage = {
        id: randomUUID(),
        channel: 'telegram',
        channelMessageId: String(msg.message_id),
        userId: String(msg.from?.id ?? 'unknown'),
        userName: msg.from?.username ?? msg.from?.first_name ?? 'unknown',
        text: '',
        attachments: [
          {
            type: 'voice',
            buffer: voiceBuffer,
            mimeType: 'audio/ogg',
            fileName: `voice_${voice.file_id}.ogg`,
          },
        ],
        replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
        timestamp: new Date(msg.date * 1000),
        raw: msg,
      };
      await this.handleIncoming(normalized);
    });

    await this.bot.launch();
    this.logger.info('Telegram bot started');
  }

  async stop(): Promise<void> {
    if (this.bot) {
      this.bot.stop('SIGTERM');
      this.logger.info('Telegram bot stopped');
    }
  }

  async send(channelId: string, message: OutgoingMessage): Promise<void> {
    if (!this.bot) {
      throw new Error('TelegramAdapter not initialized');
    }

    const chatId = channelId;

    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.type === 'audio' && attachment.buffer) {
          await this.bot.telegram.sendVoice(chatId, { source: attachment.buffer });
        } else if (attachment.type === 'image' && attachment.buffer) {
          await this.bot.telegram.sendPhoto(chatId, { source: attachment.buffer });
        } else if (attachment.url) {
          await this.bot.telegram.sendDocument(chatId, attachment.url);
        }
      }
    }

    if (message.text) {
      if (message.format === 'markdown') {
        await this.bot.telegram.sendMessage(chatId, message.text, { parse_mode: 'Markdown' });
      } else if (message.format === 'html') {
        await this.bot.telegram.sendMessage(chatId, message.text, { parse_mode: 'HTML' });
      } else {
        await this.bot.telegram.sendMessage(chatId, message.text);
      }
    }
  }
}
