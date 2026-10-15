import assert from 'node:assert/strict';
import { it } from 'node:test';
import { SqliteEMP002WhatsAppConversationStore } from './emp002-whatsapp-conversation-store';
import type { SchedulingSqlStorage } from './emp002-scheduling-store';

class MemorySql implements SchedulingSqlStorage {
  private readonly conversations = new Map<string, string>();
  private readonly seen = new Set<string>();
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): Iterable<T> {
    const sql = query.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('CREATE TABLE')) return [];
    const key = `${bindings[0]}:${bindings[1]}`;
    if (sql.startsWith('SELECT payload FROM emp002_whatsapp_conversation')) {
      const payload = this.conversations.get(key);
      return (payload ? [{ payload }] : []) as T[];
    }
    if (sql.startsWith('INSERT INTO emp002_whatsapp_conversation')) {
      this.conversations.set(key, String(bindings[3]));
      return [];
    }
    if (sql.startsWith('SELECT message_id FROM emp002_whatsapp_inbound_seen')) {
      return (this.seen.has(key) ? [{ message_id: bindings[1] }] : []) as T[];
    }
    if (sql.startsWith('INSERT INTO emp002_whatsapp_inbound_seen')) {
      this.seen.add(key);
      return [];
    }
    if (sql.startsWith('DELETE FROM emp002_whatsapp_inbound_seen')) {
      this.seen.delete(key);
      return [];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

it('deduplicates retried inbound messages without repeating conversation history', async () => {
  const store = new SqliteEMP002WhatsAppConversationStore(new MemorySql());
  const tenant = 'tenant-a';
  const id = 'wamid.retry-1';
  assert.equal(await store.markInboundOnce(tenant, id, '2026-10-11T12:00:00Z'), true);
  await store.append(tenant, '595981000000', { role: 'user', content: 'Hola', at: '2026-10-11T12:00:00Z', messageId: id });
  await store.releaseInboundForRetry(tenant, id);
  assert.equal(await store.markInboundOnce(tenant, id, '2026-10-11T12:00:00Z'), true);
  await store.append(tenant, '595981000000', { role: 'user', content: 'Hola', at: '2026-10-11T12:00:00Z', messageId: id });
  assert.equal((await store.get(tenant, '595981000000')).messages.length, 1);
  assert.equal(await store.markInboundOnce(tenant, id, '2026-10-11T12:00:00Z'), false);
});
