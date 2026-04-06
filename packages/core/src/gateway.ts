import { createChildLogger } from '@nexus/shared';
import type {
  ChannelAdapter,
  NormalizedMessage,
  OutgoingMessage,
  NexusConfig,
} from '@nexus/shared';
import type { SQLiteStore } from '@nexus/memory';

const logger = createChildLogger('gateway');

export class Gateway {
  private adapters: Map<string, ChannelAdapter> = new Map();
  private channelRequirements: Map<string, boolean> = new Map();
  processor: ((message: NormalizedMessage) => Promise<OutgoingMessage>) | null = null;
  private rateLimitMap: Map<string, number[]> = new Map();
  private rateLimitPerMinute: number;
  private allowedUserIds?: Record<string, string[]>;
  private store?: SQLiteStore;
  private pruneInterval?: ReturnType<typeof setInterval>;

  constructor(config: NexusConfig, store?: SQLiteStore) {
    this.rateLimitPerMinute = config.security.rateLimitPerMinute ?? 30;
    this.allowedUserIds = config.security.allowedUserIds;
    this.store = store;
    // Prune old rate events every 60s
    if (store) {
      this.pruneInterval = setInterval(() => store.pruneRateEvents(), 60_000);
    }
  }

  setProcessor(fn: (message: NormalizedMessage) => Promise<OutgoingMessage>): void {
    this.processor = fn;
  }

  registerAdapter(adapter: ChannelAdapter, required: boolean = false): void {
    this.adapters.set(adapter.name, adapter);
    this.channelRequirements.set(adapter.name, required);

    adapter.onMessage(async (message: NormalizedMessage) => {
      // Authorization check
      if (!this.isAuthorized(message.userId, message.channel)) {
        logger.warn({ userId: message.userId, channel: message.channel }, 'Unauthorized message rejected');
        return; // Silent reject — don't reveal bot exists to unauthorized users
      }

      // Rate limit check
      if (this.checkRateLimit(message.userId)) {
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

  private isAuthorized(userId: string, channel: string): boolean {
    if (!this.allowedUserIds || Object.keys(this.allowedUserIds).length === 0) {
      return true; // No allowlist = allow all (personal single-user mode)
    }
    const globalList = this.allowedUserIds['*'] ?? [];
    const channelList = this.allowedUserIds[channel] ?? [];
    return globalList.includes(userId) || channelList.includes(userId);
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

  private checkRateLimit(userId: string): boolean {
    if (this.store) {
      return this.store.isRateLimited(userId, this.rateLimitPerMinute);
    }
    // Fallback to in-memory if no store provided
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(userId) ?? [];
    const windowStart = now - 60_000;
    const recent = timestamps.filter((t) => t > windowStart);
    return recent.length >= this.rateLimitPerMinute;
  }

  private recordMessage(userId: string): void {
    if (this.store) {
      this.store.recordRateEvent(userId);
      return;
    }
    // Fallback to in-memory if no store provided
    const now = Date.now();
    const timestamps = this.rateLimitMap.get(userId) ?? [];
    const windowStart = now - 60_000;
    const recent = timestamps.filter((t) => t > windowStart);
    recent.push(now);
    this.rateLimitMap.set(userId, recent);
  }

  async startAll(): Promise<void> {
    const failures: { name: string; required: boolean; error: Error }[] = [];

    for (const [name, adapter] of this.adapters) {
      try {
        await adapter.start();
        logger.info({ channel: name }, 'Channel adapter started');
      } catch (err) {
        const isRequired = this.channelRequirements.get(name) ?? false;
        const error = err instanceof Error ? err : new Error(String(err));
        failures.push({ name, required: isRequired, error });
        logger.error({ err, channel: name, required: isRequired }, 'Failed to start channel adapter');
      }
    }

    const requiredFailures = failures.filter(f => f.required);
    if (requiredFailures.length > 0) {
      const names = requiredFailures.map(f => f.name).join(', ');
      throw new Error(`Required channel(s) failed to start: ${names}. Aborting.`);
    }

    if (failures.length > 0) {
      const names = failures.map(f => f.name).join(', ');
      logger.warn({ failedChannels: names }, 'Some non-required channels failed to start');
    }
  }

  async stopAll(): Promise<void> {
    if (this.pruneInterval) {
      clearInterval(this.pruneInterval);
    }
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
