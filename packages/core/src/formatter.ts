import type { ChannelType } from '@nexus/shared';

export class ResponseFormatter {
  formatForChannel(text: string, channel: ChannelType): string {
    switch (channel) {
      case 'telegram':
        // Telegram supports a subset of markdown. Convert ** bold ** to *bold*
        // and ``` code blocks work natively
        return text
          .replace(/\*\*(.+?)\*\*/g, '*$1*') // Bold: ** → *
          .replace(/__(.*?)__/g, '_$1_');     // Underline

      case 'discord':
        // Discord supports standard markdown — pass through as-is
        return text;

      case 'slack':
        // Slack uses mrkdwn: *bold*, _italic_, `code`, ```code block```
        return text
          .replace(/\*\*(.+?)\*\*/g, '*$1*')   // Bold: ** → *
          .replace(/\*(?!\*)(.+?)(?<!\*)\*/g, '_$1_');  // Italic: single * → _

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
