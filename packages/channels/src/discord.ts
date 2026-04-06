import {
  Client,
  GatewayIntentBits,
  Events,
  type Message,
  ChannelType as DiscordChannelType,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, NormalizedMessage, OutgoingMessage } from '@nexus/shared';
import { BaseAdapter } from './base-adapter.js';

interface DiscordConfig extends ChannelConfig {
  botToken: string;
}

export class DiscordAdapter extends BaseAdapter {
  readonly name = 'discord' as const;
  private client?: Client;
  private botToken?: string;

  async initialize(config: ChannelConfig): Promise<void> {
    const discordConfig = config as DiscordConfig;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.client.on(Events.MessageCreate, async (message: Message) => {
      // Ignore messages from bots
      if (message.author.bot) return;

      const isDM = message.channel.type === DiscordChannelType.DM;
      const isMentioned = this.client?.user && message.mentions.has(this.client.user);

      // Only respond when mentioned or in DMs
      if (!isDM && !isMentioned) return;

      // Strip mention from text if present
      let text = message.content;
      if (this.client?.user) {
        text = text.replace(new RegExp(`<@!?${this.client.user.id}>`, 'g'), '').trim();
      }

      // Handle code blocks by preserving them as-is
      // The text is passed through so downstream can handle markdown formatting

      const normalized: NormalizedMessage = {
        id: randomUUID(),
        channel: 'discord',
        channelMessageId: message.id,
        userId: message.author.id,
        userName: message.author.username,
        text,
        attachments: message.attachments.map((attachment) => ({
          type: 'file' as const,
          url: attachment.url,
          mimeType: attachment.contentType ?? 'application/octet-stream',
          fileName: attachment.name ?? undefined,
        })),
        replyTo: message.reference?.messageId ?? undefined,
        timestamp: message.createdAt,
        raw: message,
      };

      await this.handleIncoming(normalized);
    });

    this.botToken = discordConfig.botToken;
    this.logger.info('Discord adapter initialized');
  }

  async start(): Promise<void> {
    if (!this.client || !this.botToken) {
      throw new Error('DiscordAdapter not initialized');
    }
    await this.client.login(this.botToken);
    this.logger.info('Discord bot started');
  }

  async stop(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.logger.info('Discord bot stopped');
    }
  }

  async send(channelId: string, message: OutgoingMessage): Promise<void> {
    if (!this.client) {
      throw new Error('DiscordAdapter not initialized');
    }

    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased() || !('send' in channel)) {
      throw new Error(`Channel ${channelId} not found or not text-based`);
    }

    const sendableChannel = channel as { send: (options: string | { content?: string; files?: Array<{ attachment: Buffer; name: string }> }) => Promise<unknown> };

    // Discord renders markdown natively; HTML is not supported — both sent as plain text
    const content = message.text;

    // Discord has a 2000 character limit; split if necessary
    if (content.length > 2000) {
      const chunks = content.match(/.{1,2000}/gs) ?? [content];
      for (const chunk of chunks) {
        await sendableChannel.send(chunk);
      }
    } else if (content.length > 0) {
      await sendableChannel.send(content);
    }

    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.buffer) {
          await sendableChannel.send({
            files: [
              {
                attachment: attachment.buffer,
                name: attachment.fileName ?? 'attachment',
              },
            ],
          });
        } else if (attachment.url) {
          await sendableChannel.send(attachment.url);
        }
      }
    }
  }
}
