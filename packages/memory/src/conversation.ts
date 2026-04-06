import type { ChannelType, ConversationContext, ConversationTurn } from '@nexus/shared';
import type { SQLiteStore } from './sqlite-store.js';

export class ConversationManager {
  private store: SQLiteStore;
  private maxContextTurns: number;

  constructor(store: SQLiteStore, maxContextTurns: number) {
    this.store = store;
    this.maxContextTurns = maxContextTurns;
  }

  getContext(userId: string, channel: ChannelType, systemPrompt: string): ConversationContext {
    const conversationId = this.store.getOrCreateConversation(userId, channel);
    const turns = this.store.getTurns(conversationId, this.maxContextTurns);

    return {
      conversationId,
      userId,
      channel,
      turns,
      systemPrompt,
    };
  }

  addUserMessage(userId: string, channel: ChannelType, content: string): ConversationTurn {
    const conversationId = this.store.getOrCreateConversation(userId, channel);
    return this.store.addTurn(conversationId, 'user', content, channel, userId);
  }

  addAssistantMessage(userId: string, channel: ChannelType, content: string): ConversationTurn {
    const conversationId = this.store.getOrCreateConversation(userId, channel);
    return this.store.addTurn(conversationId, 'assistant', content, channel, userId);
  }

  resetConversation(userId: string, channel: ChannelType): void {
    const conversationId = this.store.getOrCreateConversation(userId, channel);
    this.store.deleteConversation(conversationId);
  }
}
