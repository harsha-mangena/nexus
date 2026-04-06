import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ChannelType, ConversationTurn } from '@nexus/shared';
import { runMigrations } from './migrations.js';

interface ConversationRow {
  id: string;
  user_id: string;
  channel: string;
  created_at: string;
  updated_at: string;
}

interface TurnRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  channel: string;
  user_id: string;
  timestamp: string;
  metadata: string | null;
}

export class SQLiteStore {
  private db: DatabaseType;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    runMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }

  getOrCreateConversation(userId: string, channel: ChannelType): string {
    const existing = this.db
      .prepare(
        'SELECT * FROM conversations WHERE user_id = ? AND channel = ? ORDER BY updated_at DESC LIMIT 1'
      )
      .get(userId, channel) as ConversationRow | undefined;

    if (existing) {
      return existing.id;
    }

    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO conversations (id, user_id, channel) VALUES (?, ?, ?)'
      )
      .run(id, userId, channel);

    return id;
  }

  addTurn(
    conversationId: string,
    role: ConversationTurn['role'],
    content: string,
    channel: ChannelType,
    userId: string,
    metadata?: Record<string, unknown>
  ): ConversationTurn {
    const id = randomUUID();
    const metadataJson = metadata !== undefined ? JSON.stringify(metadata) : null;

    this.db
      .prepare(
        `INSERT INTO turns (id, conversation_id, role, content, channel, user_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, conversationId, role, content, channel, userId, metadataJson);

    // Update conversation's updated_at
    this.db
      .prepare(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
      .run(conversationId);

    return {
      id,
      conversationId,
      role,
      content,
      channel,
      userId,
      timestamp: new Date(),
      metadata,
    };
  }

  getTurns(conversationId: string, limit: number): ConversationTurn[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT * FROM turns WHERE conversation_id = ?
           ORDER BY timestamp DESC LIMIT ?
         ) ORDER BY timestamp ASC`
      )
      .all(conversationId, limit) as TurnRow[];

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as ConversationTurn['role'],
      content: row.content,
      channel: row.channel as ChannelType,
      userId: row.user_id,
      timestamp: new Date(row.timestamp),
      metadata: row.metadata !== null ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    }));
  }

  deleteConversation(conversationId: string): void {
    this.db
      .prepare('DELETE FROM turns WHERE conversation_id = ?')
      .run(conversationId);
    this.db
      .prepare('DELETE FROM conversations WHERE id = ?')
      .run(conversationId);
  }
}
