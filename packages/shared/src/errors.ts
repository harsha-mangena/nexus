export class NexusError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'NEXUS_ERROR') {
    super(message);
    this.name = 'NexusError';
    this.code = code;
  }
}

export class ConfigError extends NexusError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class ProviderError extends NexusError {
  public readonly provider: string;

  constructor(message: string, provider: string) {
    super(message, 'PROVIDER_ERROR');
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

export class ChannelError extends NexusError {
  public readonly channel: string;

  constructor(message: string, channel: string) {
    super(message, 'CHANNEL_ERROR');
    this.name = 'ChannelError';
    this.channel = channel;
  }
}

export class ToolError extends NexusError {
  public readonly tool: string;

  constructor(message: string, tool: string) {
    super(message, 'TOOL_ERROR');
    this.name = 'ToolError';
    this.tool = tool;
  }
}

export class MemoryError extends NexusError {
  constructor(message: string) {
    super(message, 'MEMORY_ERROR');
    this.name = 'MemoryError';
  }
}

export class RateLimitError extends NexusError {
  constructor(userId: string) {
    super(`Rate limit exceeded for user ${userId}`, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}
