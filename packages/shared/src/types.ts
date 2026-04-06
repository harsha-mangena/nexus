// ===== Core Message Types =====
export type ChannelType = 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'cli';

export interface NormalizedMessage {
  id: string;
  channel: ChannelType;
  channelMessageId: string;
  userId: string;
  userName: string;
  text: string;
  attachments: Attachment[];
  replyTo?: string;
  timestamp: Date;
  raw: unknown;
}

export interface Attachment {
  type: 'image' | 'audio' | 'video' | 'file' | 'voice';
  url?: string;
  buffer?: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface OutgoingMessage {
  text: string;
  attachments?: OutgoingAttachment[];
  replyTo?: string;
  format?: 'text' | 'markdown' | 'html';
}

export interface OutgoingAttachment {
  type: 'image' | 'audio' | 'file';
  buffer?: Buffer;
  url?: string;
  fileName?: string;
  mimeType: string;
}

// ===== Channel Adapter =====
export interface ChannelAdapter {
  readonly name: ChannelType;
  initialize(config: ChannelConfig): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(channelId: string, message: OutgoingMessage): Promise<void>;
  onMessage(handler: (message: NormalizedMessage) => Promise<void>): void;
}

// ===== Intent & Routing =====
export type IntentCategory = 'SIMPLE' | 'CODE' | 'CREATIVE' | 'ANALYSIS' | 'AGENTIC' | 'VOICE';

export interface ClassificationResult {
  intent: IntentCategory;
  confidence: number;
  reasoning?: string;
}

export interface ModelRoute {
  intent: IntentCategory;
  provider: 'openai' | 'google' | 'ollama';
  model: string;
  maxTokens: number;
  temperature: number;
  supportsTools: boolean;
  costTier: 'free' | 'low' | 'medium' | 'high';
}

// ===== Orchestrator Result =====
export interface OrchestratorResult {
  text: string;
  audio?: Buffer;
  audioMimeType?: string;
}

// ===== Configuration =====
export interface NexusConfig {
  assistant: {
    name: string;
    personaFile?: string;
  };
  channels: Record<string, ChannelConfig>;
  providers: {
    openai?: { apiKey: string; defaultModel?: string };
    google?: { apiKey: string; defaultModel?: string };
    ollama?: { baseUrl: string; defaultModel?: string };
  };
  routing: {
    defaultProvider: 'openai' | 'google' | 'ollama';
    fallbackPolicy?: 'allow' | 'warn' | 'deny';
    rules: RoutingRule[];
  };
  memory: {
    dbPath: string;
    maxContextTurns: number;
    retentionDays: number;
  };
  voice?: {
    whisperUrl?: string;
    piperUrl?: string;
    defaultVoice?: string;
  };
  tools: {
    enabled: string[];
    allowedPaths?: string[];
  };
  security: {
    allowedUserIds?: Record<string, string[]>;
    rateLimitPerMinute?: number;
  };
}

export interface ChannelConfig {
  enabled: boolean;
  [key: string]: unknown;
}

export interface RoutingRule {
  intent: IntentCategory;
  provider: 'openai' | 'google' | 'ollama';
  model: string;
  maxTokens?: number;
  temperature?: number;
}

// ===== Tools =====
export interface NexusTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// ===== Memory =====
export interface ConversationTurn {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  channel: ChannelType;
  userId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  channel: ChannelType;
  turns: ConversationTurn[];
  systemPrompt: string;
}

// ===== Events =====
export interface NexusEvents {
  'message:incoming': (message: NormalizedMessage) => void;
  'message:outgoing': (channelId: string, message: OutgoingMessage) => void;
  'error': (error: Error, context?: string) => void;
  'channel:started': (channel: ChannelType) => void;
  'channel:stopped': (channel: ChannelType) => void;
}
