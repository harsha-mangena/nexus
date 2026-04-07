import type { NexusTool } from '@nexus/shared';

const SLACK_API = 'https://slack.com/api';

function getToken(): string {
  const token = process.env['SLACK_BOT_TOKEN'] || process.env['SLACK_TOKEN'];
  if (!token) {
    throw new Error('SLACK_BOT_TOKEN environment variable is not set');
  }
  return token;
}

async function slackAPI(method: string, params: Record<string, string> = {}): Promise<unknown> {
  const token = getToken();
  const url = new URL(`${SLACK_API}/${method}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return res.json();
}

async function slackPost(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = getToken();
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

interface SlackResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

const slack: NexusTool = {
  name: 'slack',
  description: 'Interact with Slack — list channels, read messages, search messages, or post a message. Requires SLACK_BOT_TOKEN env var.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list_channels', 'read_messages', 'search_messages', 'post_message'],
        description: 'The Slack action to perform',
      },
      channel_name: {
        type: 'string',
        description: 'Channel name (without #) for read_messages and post_message',
      },
      query: {
        type: 'string',
        description: 'Search query for search_messages',
      },
      message: {
        type: 'string',
        description: 'Message text for post_message',
      },
      limit: {
        type: 'number',
        description: 'Number of results to return (default 10)',
      },
    },
    required: ['action'],
  },

  async execute(args: Record<string, unknown>): Promise<unknown> {
    const action = args['action'] as string;
    const channelName = args['channel_name'] as string | undefined;
    const query = args['query'] as string | undefined;
    const message = args['message'] as string | undefined;
    const limit = String(args['limit'] ?? 10);

    try {
      switch (action) {
        case 'list_channels': {
          const data = await slackAPI('conversations.list', { types: 'public_channel,private_channel', limit }) as SlackResponse;
          if (!data.ok) return `Slack API error: ${data.error}`;
          const channels = (data['channels'] as Array<{ name: string; id: string; topic?: { value: string }; num_members?: number }>) || [];
          return channels.map(ch => ({
            name: ch.name,
            id: ch.id,
            topic: ch.topic?.value || '',
            members: ch.num_members ?? 0,
          }));
        }

        case 'read_messages': {
          if (!channelName) return 'Error: channel_name is required for read_messages';
          // Resolve channel name to ID
          const channelId = await resolveChannelId(channelName);
          if (!channelId) return `Error: channel #${channelName} not found`;
          const data = await slackAPI('conversations.history', { channel: channelId, limit }) as SlackResponse;
          if (!data.ok) return `Slack API error: ${data.error}`;
          const messages = (data['messages'] as Array<{ text: string; user?: string; ts: string }>) || [];
          return messages.map(m => ({
            text: m.text,
            user: m.user || 'unknown',
            timestamp: m.ts,
          }));
        }

        case 'search_messages': {
          if (!query) return 'Error: query is required for search_messages';
          const data = await slackAPI('search.messages', { query, count: limit }) as SlackResponse;
          if (!data.ok) return `Slack API error: ${data.error}`;
          const matches = ((data['messages'] as { matches?: Array<{ text: string; channel?: { name: string }; username?: string; ts: string }> })?.matches) || [];
          return matches.map(m => ({
            text: m.text,
            channel: m.channel?.name || 'unknown',
            user: m.username || 'unknown',
            timestamp: m.ts,
          }));
        }

        case 'post_message': {
          if (!channelName) return 'Error: channel_name is required for post_message';
          if (!message) return 'Error: message is required for post_message';
          const channelId = await resolveChannelId(channelName);
          if (!channelId) return `Error: channel #${channelName} not found`;
          const data = await slackPost('chat.postMessage', { channel: channelId, text: message }) as SlackResponse;
          if (!data.ok) return `Slack API error: ${data.error}`;
          return { success: true, channel: channelName, message };
        }

        default:
          return `Error: unknown action "${action}". Use list_channels, read_messages, search_messages, or post_message.`;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error calling Slack API: ${msg}`;
    }
  },
};

async function resolveChannelId(name: string): Promise<string | null> {
  const data = await slackAPI('conversations.list', { types: 'public_channel,private_channel', limit: '200' }) as SlackResponse;
  if (!data.ok) return null;
  const channels = (data['channels'] as Array<{ name: string; id: string }>) || [];
  const match = channels.find(ch => ch.name === name);
  return match?.id ?? null;
}

export default slack;
