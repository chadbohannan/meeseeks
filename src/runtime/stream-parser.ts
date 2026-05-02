import { EventEmitter } from 'node:events';

export type ParseEvent =
  | { kind: 'init'; raw: unknown }
  | { kind: 'turn-start'; raw: unknown }
  | { kind: 'turn-end'; raw: unknown }
  | { kind: 'message-text'; text: string; raw: unknown }
  | { kind: 'parse-error'; line: string; error: string };

export class StreamParser extends EventEmitter {
  private leftover = '';
  private inTurn = false;

  feed(chunk: Buffer): void {
    const text = this.leftover + chunk.toString('utf8');
    const lines = text.split('\n');
    this.leftover = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch (err) {
        this.emit('event', { kind: 'parse-error', line: trimmed, error: String(err) } satisfies ParseEvent);
        continue;
      }
      const obj = parsed as { type?: string; subtype?: string; message?: { content?: Array<{ type?: string; text?: string }> }; result?: string };
      if (obj.type === 'system' && obj.subtype === 'init') {
        this.emit('event', { kind: 'init', raw: parsed } satisfies ParseEvent);
      } else if (obj.type === 'assistant' || obj.type === 'user') {
        if (!this.inTurn) {
          this.inTurn = true;
          this.emit('event', { kind: 'turn-start', raw: parsed } satisfies ParseEvent);
        }
        if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
          const text = obj.message!.content!
            .filter(b => b?.type === 'text' && typeof b.text === 'string')
            .map(b => b.text!)
            .join('');
          if (text) this.emit('event', { kind: 'message-text', text, raw: parsed } satisfies ParseEvent);
        }
      } else if (obj.type === 'result') {
        if (typeof obj.result === 'string' && obj.result) {
          this.emit('event', { kind: 'message-text', text: obj.result, raw: parsed } satisfies ParseEvent);
        }
        this.inTurn = false;
        this.emit('event', { kind: 'turn-end', raw: parsed } satisfies ParseEvent);
      }
    }
  }
}
