import type { ChannelType, ChannelConfig, NormalizedMessage, OutgoingMessage, ChannelAdapter } from '@nexus/shared';
import { createChildLogger } from '@nexus/shared';

export abstract class BaseAdapter implements ChannelAdapter {
  abstract readonly name: ChannelType;
  protected logger: ReturnType<typeof createChildLogger>;
  protected messageHandler?: (message: NormalizedMessage) => Promise<void>;

  constructor() {
    this.logger = createChildLogger(this.constructor.name);
  }

  abstract initialize(config: ChannelConfig): Promise<void>;
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(channelId: string, message: OutgoingMessage): Promise<void>;

  onMessage(handler: (message: NormalizedMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  protected async handleIncoming(message: NormalizedMessage): Promise<void> {
    if (this.messageHandler) {
      try {
        await this.messageHandler(message);
      } catch (err) {
        this.logger.error({ err, messageId: message.id }, 'Error handling incoming message');
      }
    }
  }
}
