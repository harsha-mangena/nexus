import { createServer, type Server } from 'node:http';
import express, { type Request, type Response } from 'express';
import { fetch } from 'undici';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, NormalizedMessage, OutgoingMessage } from '@nexus/shared';
import { BaseAdapter } from './base-adapter.js';

interface WhatsAppConfig extends ChannelConfig {
  wahaUrl: string;
  webhookUrl?: string;
  webhookPort?: number;
  session?: string;
}

interface WAHAWebhookEvent {
  event: string;
  session: string;
  payload?: {
    id?: string;
    from?: string;
    body?: string;
    timestamp?: number;
    _data?: {
      notifyName?: string;
    };
  };
}

export class WhatsAppAdapter extends BaseAdapter {
  readonly name = 'whatsapp' as const;
  private wahaUrl?: string;
  private session: string = 'default';
  private webhookUrl?: string;
  private server?: Server;
  private webhookPort: number = 3100;
  private readonly webhookPath: string = '/webhook/whatsapp';

  async initialize(config: ChannelConfig): Promise<void> {
    const waConfig = config as WhatsAppConfig;
    this.wahaUrl = waConfig.wahaUrl.replace(/\/$/, '');
    this.session = waConfig.session ?? 'default';
    this.webhookUrl = waConfig.webhookUrl;
    this.webhookPort = waConfig.webhookPort ?? 3100;
    this.logger.info('WhatsApp adapter initialized');
  }

  async start(): Promise<void> {
    if (!this.wahaUrl) {
      throw new Error('WhatsAppAdapter not initialized');
    }

    const app = express();
    app.use(express.json());

    app.post(this.webhookPath, (req: Request, res: Response) => {
      const event = req.body as WAHAWebhookEvent;
      this.handleWebhookEvent(event).catch((err) => {
        this.logger.error({ err }, 'Error handling WhatsApp webhook event');
      });
      res.sendStatus(200);
    });

    await new Promise<void>((resolve, reject) => {
      this.server = createServer(app);
      this.server.listen(this.webhookPort, () => {
        this.logger.info({ port: this.webhookPort, path: this.webhookPath }, 'WhatsApp webhook server listening');
        resolve();
      });
      this.server.on('error', reject);
    });

    // Register webhook with WAHA
    const webhookUrl = this.webhookUrl ?? `http://localhost:${this.webhookPort}${this.webhookPath}`;
    try {
      const response = await fetch(`${this.wahaUrl}/api/sessions/${this.session}/config/webhook`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          events: ['message'],
        }),
      });
      if (!response.ok) {
        this.logger.warn({ status: response.status }, 'Failed to register webhook with WAHA');
      } else {
        this.logger.info({ webhookUrl }, 'Registered webhook with WAHA');
      }
    } catch (err) {
      this.logger.warn({ err }, 'Could not register webhook with WAHA — continuing anyway');
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.logger.info('WhatsApp webhook server stopped');
    }
  }

  async send(channelId: string, message: OutgoingMessage): Promise<void> {
    if (!this.wahaUrl) {
      throw new Error('WhatsAppAdapter not initialized');
    }

    const response = await fetch(`${this.wahaUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: channelId,
        text: message.text,
        session: this.session,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WAHA sendText failed: ${response.status} ${body}`);
    }
  }

  private async handleWebhookEvent(event: WAHAWebhookEvent): Promise<void> {
    if (event.event !== 'message') return;
    if (!event.payload) return;

    const payload = event.payload;
    const normalized: NormalizedMessage = {
      id: randomUUID(),
      channel: 'whatsapp',
      channelMessageId: payload.id ?? randomUUID(),
      userId: payload.from ?? 'unknown',
      userName: payload._data?.notifyName ?? payload.from ?? 'unknown',
      text: payload.body ?? '',
      attachments: [],
      timestamp: payload.timestamp ? new Date(payload.timestamp * 1000) : new Date(),
      raw: event,
    };

    await this.handleIncoming(normalized);
  }
}
