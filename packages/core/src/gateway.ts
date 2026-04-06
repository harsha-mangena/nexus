import { createChildLogger } from '@nexus/shared';
import type {
  ChannelAdapter,
  NormalizedMessage,
  OutgoingMessage,
  NexusConfig,
} from '@nexus/shared';

const logger = createChildLogger('gateway');

export class Gateway {
  private adapters: Map<string, ChannelAdapter> = new Map();
  processor: ((message: NormalizedMessage) => Promise<OutgoingMessage>) | null = null;
  private rateLimitMap: Map<string, number[]> = new Map();
  private rateLimitPerMinute: number;

  constructor(config: NexusConfig) {
    this.rateLimitPerMinute = config.security.rateLimitPerMinute ?? 30;
  }

  setProcessor(fn: (message: NormalizedMessage) => Promise<OutgoingMessage>): void {
    this.processor = fn;
  }

  registerAdapter(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.name, adapter);

    adapter.onMessage(async (message: NormalizedMessage) => {
      // Rate limit check
      if (this.isRateLimited(message.userId)) {
        const errorMsg: OutgoingMessage = { text: 'You are sending messages too quickly. Please slow down.' };
        const channelId = this.extractChannelId(message);
        await adapter.send(channelId, errorMsg);
        return;
      }
      this.recordMessage(message.userId);

      if (!this.processor) {
        logger.warn('No processor set on gateway');
        return;
      }

      try {
        const response = await this.processor(message);
        const channelId = this.extractChannelId(message);
        await adapter.send(channelId, response);
      } catch (err) {
        logger.error({ err, messageId: message.id }, 'Error processing message');
        const errorMsg: OutgoingMessage = { text: 'Sorry, I encountered an error processing your message. Please try again.' };
        const channelId = this.extractChannelId(message);
        await adapter.send(channelId, errorMsg);
      }
    });
  }

  private extractChannelId(message: NormalizedMessage): string {
    switch (message.channel) {
      case 'telegram':
        return String((message.raw as any).chat?.id ?? message.userId);
      case 'discord':
        return (message.raw as any).channelId ?? message.userId;
      case 'slack':
        return (message.raw as any).channel ?? message.userId;
      case 'whatsapp':
        return message.userId;
      case 'cli':
        return message.userId;
      default:
        return message.userId;
    }
  }

  private isRateLimited(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(userId) ?? [];
    const windowStart = now - 60_000;
    const recent = timestamps.filter((t) => t > windowStart);
    return recent.length >= this.rateLimitPerMinute;
  }

  private recordMessage(userId: string): void {
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(userId) ?? [];
    const windowStart = now - 60_000;
    const recent = timestamps.filter((t) => t > windowStart);
    recent.push(now);
    this.rateLimitMap.set(userId, recent);
  }

  async startAll(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.start();
        logger.info({ channel: name }, 'Channel adapter started');
      } catch (err) {
        logger.error({ err, channel: name }, 'Failed to start channel adapter');
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.stop();
        logger.info({ channel: name }, 'Channel adapter stopped');
      } catch (err) {
        logger.error({ err, channel: name }, 'Failed to stop channel adapter');
      }
    }
  }
}
