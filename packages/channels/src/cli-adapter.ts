import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { ChannelConfig, ChannelType, NormalizedMessage, OutgoingMessage } from '@nexus/shared';
import { BaseAdapter } from './base-adapter.js';

// ANSI color codes
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';
const GRAY = '\x1b[90m';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class CLIAdapter extends BaseAdapter {
  readonly name = 'cli' as const;
  private rl?: readline.Interface;
  private conversationId: string = randomUUID();
  private running: boolean = false;
  private resetHandler?: (userId: string, channel: ChannelType) => Promise<void>;
  private history: Array<{ role: 'user' | 'assistant'; text: string; time: Date }> = [];
  private spinnerInterval?: ReturnType<typeof setInterval>;
  private assistantName = 'Nexus';
  private toolNames: string[] = [];

  onReset(handler: (userId: string, channel: ChannelType) => Promise<void>): void {
    this.resetHandler = handler;
  }

  setAssistantName(name: string): void {
    this.assistantName = name;
  }

  setToolNames(names: string[]): void {
    this.toolNames = names;
  }

  async initialize(_config: ChannelConfig): Promise<void> {
    this.logger.info('CLI adapter initialized');
  }

  private drawHeader(): void {
    const title = `  ${this.assistantName} AI Assistant`;
    const subtitle = '  Type /help for commands, /quit to exit';
    const width = Math.max(title.length, subtitle.length) + 4;
    const border = '\u2500'.repeat(width);

    process.stdout.write('\n');
    process.stdout.write(`${CYAN}${BOLD}\u250c${border}\u2510${RESET}\n`);
    process.stdout.write(`${CYAN}${BOLD}\u2502${RESET}${BOLD}${WHITE}${title.padEnd(width)}${RESET}${CYAN}${BOLD}\u2502${RESET}\n`);
    process.stdout.write(`${CYAN}${BOLD}\u2502${RESET}${DIM}${subtitle.padEnd(width)}${RESET}${CYAN}${BOLD}\u2502${RESET}\n`);
    process.stdout.write(`${CYAN}${BOLD}\u2514${border}\u2518${RESET}\n`);
    process.stdout.write('\n');
  }

  private showHelp(): void {
    process.stdout.write(`\n${YELLOW}${BOLD}Available Commands:${RESET}\n`);
    process.stdout.write(`${DIM}  /help${RESET}    \u2014 Show this help message\n`);
    process.stdout.write(`${DIM}  /quit${RESET}    \u2014 Exit the assistant\n`);
    process.stdout.write(`${DIM}  /reset${RESET}   \u2014 Start a new conversation\n`);
    process.stdout.write(`${DIM}  /tools${RESET}   \u2014 List available tools\n`);
    process.stdout.write(`${DIM}  /history${RESET} \u2014 Show conversation history\n`);
    process.stdout.write(`${DIM}  /clear${RESET}   \u2014 Clear the terminal\n`);
    process.stdout.write('\n');
  }

  private showTools(): void {
    if (this.toolNames.length === 0) {
      process.stdout.write(`\n${DIM}  No tools currently enabled.${RESET}\n\n`);
      return;
    }
    process.stdout.write(`\n${YELLOW}${BOLD}Available Tools:${RESET}\n`);
    for (const name of this.toolNames) {
      process.stdout.write(`${DIM}  \u2022 ${name}${RESET}\n`);
    }
    process.stdout.write('\n');
  }

  private showHistory(): void {
    if (this.history.length === 0) {
      process.stdout.write(`\n${DIM}  No messages in this conversation yet.${RESET}\n\n`);
      return;
    }
    process.stdout.write(`\n${YELLOW}${BOLD}Conversation History:${RESET}\n`);
    for (const entry of this.history) {
      const timeStr = entry.time.toLocaleTimeString();
      if (entry.role === 'user') {
        process.stdout.write(`${GRAY}  [${timeStr}]${RESET} ${CYAN}${BOLD}You:${RESET} ${entry.text}\n`);
      } else {
        process.stdout.write(`${GRAY}  [${timeStr}]${RESET} ${GREEN}${BOLD}${this.assistantName}:${RESET} ${entry.text.substring(0, 100)}${entry.text.length > 100 ? '...' : ''}\n`);
      }
    }
    process.stdout.write('\n');
  }

  private startSpinner(): void {
    let frameIdx = 0;
    this.spinnerInterval = setInterval(() => {
      const frame = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length]!;
      process.stdout.write(`\r${MAGENTA}  ${frame} Thinking...${RESET}  `);
      frameIdx++;
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
      // Clear the spinner line
      process.stdout.write('\r\x1b[2K');
    }
  }

  private prompt(): void {
    process.stdout.write(`${CYAN}${BOLD}  You: ${RESET}`);
  }

  async start(): Promise<void> {
    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    // Clear terminal and draw header
    process.stdout.write('\x1Bc');
    this.drawHeader();
    this.prompt();

    this.rl.on('line', async (line) => {
      const input = line.trim();

      if (!this.running) return;

      if (input === '/quit') {
        process.stdout.write(`\n${DIM}  Goodbye!${RESET}\n\n`);
        await this.stop();
        process.exit(0);
        return;
      }

      if (input === '/help') {
        this.showHelp();
        this.prompt();
        return;
      }

      if (input === '/reset') {
        this.conversationId = randomUUID();
        this.history = [];
        if (this.resetHandler) {
          await this.resetHandler('cli-user', 'cli');
        }
        process.stdout.write(`\n${DIM}  [Conversation reset]${RESET}\n\n`);
        this.prompt();
        return;
      }

      if (input === '/tools') {
        this.showTools();
        this.prompt();
        return;
      }

      if (input === '/history') {
        this.showHistory();
        this.prompt();
        return;
      }

      if (input === '/clear') {
        process.stdout.write('\x1Bc');
        this.drawHeader();
        this.prompt();
        return;
      }

      if (input.startsWith('/')) {
        process.stdout.write(`${DIM}  Unknown command: ${input}. Type /help for available commands.${RESET}\n`);
        this.prompt();
        return;
      }

      if (!input) {
        this.prompt();
        return;
      }

      // Record user message
      this.history.push({ role: 'user', text: input, time: new Date() });

      // Show thinking spinner
      this.startSpinner();

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
    this.stopSpinner();
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
      this.logger.info('CLI adapter stopped');
    }
  }

  async send(_channelId: string, message: OutgoingMessage): Promise<void> {
    this.stopSpinner();
    const output = message.text;

    // Record assistant message
    this.history.push({ role: 'assistant', text: output, time: new Date() });

    process.stdout.write(`\n${GREEN}${BOLD}  ${this.assistantName}:${RESET} `);

    // Handle multi-line output with proper indentation
    const lines = output.split('\n');
    process.stdout.write(lines[0] + '\n');
    const indent = ' '.repeat(this.assistantName.length + 4);
    for (let i = 1; i < lines.length; i++) {
      process.stdout.write(`${indent}${lines[i]}\n`);
    }

    process.stdout.write('\n');
    this.prompt();
  }
}
