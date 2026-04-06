import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, NormalizedMessage, OutgoingMessage } from '@nexus/shared';
import { BaseAdapter } from './base-adapter.js';

export class CLIAdapter extends BaseAdapter {
  readonly name = 'cli' as const;
  private rl?: readline.Interface;
  private conversationId: string = randomUUID();
  private running: boolean = false;

  async initialize(_config: ChannelConfig): Promise<void> {
    this.logger.info('CLI adapter initialized');
  }

  async start(): Promise<void> {
    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    process.stdout.write('Nexus CLI — type /quit to exit, /reset to start a new conversation, /status to check status\n');
    process.stdout.write('> ');

    this.rl.on('line', async (line) => {
      const input = line.trim();

      if (!this.running) return;

      if (input === '/quit') {
        process.stdout.write('Goodbye!\n');
        await this.stop();
        process.exit(0);
        return;
      }

      if (input === '/reset') {
        this.conversationId = randomUUID();
        process.stdout.write(`[Conversation reset. New session: ${this.conversationId}]\n> `);
        return;
      }

      if (input === '/status') {
        process.stdout.write(`[Status: running | session: ${this.conversationId}]\n> `);
        return;
      }

      if (!input) {
        process.stdout.write('> ');
        return;
      }

      const normalized: NormalizedMessage = {
        id: randomUUID(),
        channel: 'cli',
        channelMessageId: randomUUID(),
        userId: 'cli-user',
        userName: 'cli-user',
        text: input,
        attachments: [],
        timestamp: new Date(),
        raw: { input, conversationId: this.conversationId },
      };

      await this.handleIncoming(normalized);
    });

    this.rl.on('close', () => {
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
      this.logger.info('CLI adapter stopped');
    }
  }

  async send(_channelId: string, message: OutgoingMessage): Promise<void> {
    const output = message.text;
    process.stdout.write(`\n${output}\n> `);
  }
}
