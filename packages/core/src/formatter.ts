import type { ChannelType } from '@nexus/shared';

export class ResponseFormatter {
  formatForChannel(text: string, channel: ChannelType): string {
    switch (channel) {
      case 'telegram':
        // Telegram MarkdownV1: *bold*, _italic_, `code`, ```code block```
        // Convert standard markdown: single * italic → _, then ** bold → *
        return text
          .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_')  // Italic: single * → _
          .replace(/\*\*(.+?)\*\*/g, '*$1*')                         // Bold: ** → *
          .replace(/__(.*?)__/g, '_$1_');                               // Underline: __ → _

      case 'discord':
        // Discord supports standard markdown — pass through as-is
        return text;

      case 'slack':
        // Slack uses mrkdwn: *bold*, _italic_, `code`, ```code block```
        // First convert single * italic to _, then convert ** bold to *
        // Order matters: convert italic first so bold ** doesn't get matched as double-italic
        return text
          .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '_$1_')  // Italic: single * → _ (not touching **)
          .replace(/\*\*(.+?)\*\*/g, '*$1*');   // Bold: ** → *

      case 'whatsapp':
        // WhatsApp supports *bold*, _italic_, ~strikethrough~, ```code```
        return text
          .replace(/\*\*(.+?)\*\*/g, '*$1*');   // Bold: ** → *

      case 'cli':
        // CLI — pass through for clean terminal output
        return text;

      default:
        return text;
    }
  }
}
