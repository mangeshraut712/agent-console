import { afterEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AgentServer } from '../../agent-server/src/server';
import { ChaosEngine } from '../../agent-server/src/chaos';
import type { ServerMessage } from '../../agent-server/src/types';

// Use the real connection/RESUME handlers with deterministic sockets and chaos.
class Socket extends EventEmitter {
  readyState = 1;
  sent: ServerMessage[] = [];
  onSend?: (m: ServerMessage) => void;
  send(raw: string) { const m = JSON.parse(raw); this.sent.push(m); this.onSend?.(m); }
  terminate() { this.readyState = 3; this.emit('close', 1006, Buffer.from('drop')); }
  close() { this.terminate(); }
}
afterEach(() => vi.useRealTimers());

test.each([0, 1, 2])('resumes a script dropped after %i frames through one STREAM_END', async dropAfterMessages => {
  vi.useFakeTimers();
  const server = new AgentServer('chaos') as any;
  const first = new Socket();
  server.handleConnection(first);
  first.onSend = m => { if (m.type === "TOOL_CALL") setTimeout(() => server.handleToolAck(m.call_id), 0); };
  server.chaosEngine = new ChaosEngine({ dropAfterMessages, reorderProbability: 0,
    duplicateProbability: 0, latencySpikeProbability: 0, latencySpikeMs: [0, 0], corruptPingProbability: 0 });
  server.readyForStream = true;
  const run = server.runScript(first, { id: 'resume', name: 'resume', triggers: [], events: [
    { kind: 'token', text: 'before ' },
    { kind: 'tool_call', tool_name: 'lookup_metric', args: {}, result: { value: 1 } },
    { kind: 'token', text: 'after' },
  ] });
  void run.catch(() => {});
  await vi.advanceTimersByTimeAsync(3000);
  expect(first.readyState).toBe(3);
  const second = new Socket();
  second.onSend = m => { if (m.type === 'TOOL_CALL') server.handleToolAck(m.call_id); };
  server.handleConnection(second);
  server.chaosEngine = null;
  const lastSeq = first.sent.at(-1)?.seq ?? 0;
  server.handleResume(second, lastSeq);
  await vi.advanceTimersByTimeAsync(5000);
  await run;
  const all = [...first.sent, ...second.sent];
  expect(all.filter(m => m.type === 'TOKEN').map(m => m.text).join('')).toBe('before after');
  expect(all.filter(m => m.type === 'TOOL_RESULT')).toHaveLength(1);
  expect(all.filter(m => m.type === 'STREAM_END')).toHaveLength(1);
  expect(server.clientLog.filter((e: any) => e.verdict === 'violation')).toEqual([]);
  server.resetSession();
});
