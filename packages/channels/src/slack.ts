import { App } from '@slack/bolt';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, NormalizedMessage, OutgoingMessage } from '@nexus/shared';
import { BaseAdapter } from './base-adapter.js';

interface SlackConfig extends ChannelConfig {
  botToken: string;
  appToken: string;
  signingSecret: string;
}

export class SlackAdapter extends BaseAdapter {
  readonly name = 'slack' as const;
  private app?: App;

  async initialize(config: ChannelConfig): Promise<void> {
    const slackConfig = config as SlackConfig;

    this.app = new App({
      token: slackConfig.botToken,
      appToken: slackConfig.appToken,
      signingSecret: slackConfig.signingSecret,
      socketMode: true,
    });

    // Listen for app mentions in channels
    this.app.event('app_mention', async ({ event, say: _say }) => {
      const normalized: NormalizedMessage = {
        id: randomUUID(),
        channel: 'slack',
        channelMessageId: event.ts,
        userId: event.user ?? 'unknown',
        userName: event.user ?? 'unknown',
        text: event.text,
        attachments: [],
        replyTo: event.thread_ts !== event.ts ? event.thread_ts : undefined,
        timestamp: new Date(Number(event.ts) * 1000),
        raw: event,
      };
      await this.handleIncoming(normalized);
    });

    // Listen for DMs
    this.app.event('message', async ({ event }) => {
      // Only handle DMs (channel_type is 'im')
      if (!('channel_type' in event) || event.channel_type !== 'im') return;
      // Skip bot messages, edits, and deletes
      if ('subtype' in event && event.subtype) return;
      if (!('user' in event) || !event.user) return;

      const text = 'text' in event && event.text ? event.text : '';
      const ts = 'ts' in event && event.ts ? event.ts : String(Date.now() / 1000);

      const normalized: NormalizedMessage = {
        id: randomUUID(),
        channel: 'slack',
        channelMessageId: ts,
        userId: event.user,
        userName: event.user,
        text,
        attachments: [],
        timestamp: new Date(Number(ts) * 1000),
        raw: event,
      };
      await this.handleIncoming(normalized);
    });

    this.logger.info('Slack adapter initialized');
  }

  async start(): Promise<void> {
    if (!this.app) {
      throw new Error('SlackAdapter not initialized');
    }
    await this.app.start();
    this.logger.info('Slack app started');
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.logger.info('Slack app stopped');
    }
  }

  async send(channelId: string, message: OutgoingMessage): Promise<void> {
    if (!this.app) {
      throw new Error('SlackAdapter not initialized');
    }

    await this.app.client.chat.postMessage({
      channel: channelId,
      text: message.text,
      ...(message.format === 'markdown' ? { mrkdwn: true } : {}),
    });
  }
}
