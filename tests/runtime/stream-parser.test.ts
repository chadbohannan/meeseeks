import { describe, it, expect } from 'vitest';
import { StreamParser, type ParseEvent } from '../../src/runtime/stream-parser.js';

function collect(input: string): ParseEvent[] {
  const out: ParseEvent[] = [];
  const p = new StreamParser();
  p.on('event', (e: ParseEvent) => out.push(e));
  p.feed(Buffer.from(input));
  return out;
}

describe('StreamParser', () => {
  it('emits init then turn-start then turn-end', () => {
    const stream =
      `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' })}\n` +
      `${JSON.stringify({ type: 'assistant', message: { content: [] } })}\n` +
      `${JSON.stringify({ type: 'result', subtype: 'success', session_id: 's1' })}\n`;
    const events = collect(stream);
    expect(events.map(e => e.kind)).toEqual(['init', 'turn-start', 'turn-end']);
  });

  it('handles partial chunks across writes', () => {
    const p = new StreamParser();
    const events: ParseEvent[] = [];
    p.on('event', (e) => events.push(e));
    p.feed(Buffer.from(`{"type":"system","subtype":"i`));
    p.feed(Buffer.from(`nit"}\n{"type":"result","subtype":"success"}\n`));
    expect(events.map(e => e.kind)).toEqual(['init', 'turn-end']);
  });

  it('emits parse-error for malformed JSON and continues', () => {
    const p = new StreamParser();
    const events: ParseEvent[] = [];
    p.on('event', (e) => events.push(e));
    p.feed(Buffer.from(`not-json\n{"type":"result","subtype":"success"}\n`));
    expect(events[0]?.kind).toBe('parse-error');
    expect(events[1]?.kind).toBe('turn-end');
  });

  it('emits one turn-start per turn (subsequent assistants are quiet)', () => {
    const stream =
      `${JSON.stringify({ type: 'system', subtype: 'init' })}\n` +
      `${JSON.stringify({ type: 'assistant' })}\n` +
      `${JSON.stringify({ type: 'assistant' })}\n` +
      `${JSON.stringify({ type: 'result', subtype: 'success' })}\n`;
    const events = collect(stream);
    expect(events.map(e => e.kind)).toEqual(['init', 'turn-start', 'turn-end']);
  });
});
