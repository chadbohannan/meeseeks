import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../src/runtime/ring-buffer.js';

describe('RingBuffer', () => {
  it('appends and snapshots small writes', () => {
    const r = new RingBuffer(16);
    r.append(Buffer.from('hello'));
    r.append(Buffer.from(' world'));
    expect(r.snapshot().toString('utf8')).toBe('hello world');
    expect(r.size).toBe(11);
    expect(r.dropped).toBe(0);
  });

  it('drops oldest bytes when capacity exceeded', () => {
    const r = new RingBuffer(8);
    r.append(Buffer.from('123456789'));
    expect(r.snapshot().toString('utf8')).toBe('23456789');
    expect(r.dropped).toBe(1);
  });

  it('handles a single write larger than capacity', () => {
    const r = new RingBuffer(4);
    r.append(Buffer.from('abcdefgh'));
    expect(r.snapshot().toString('utf8')).toBe('efgh');
    expect(r.dropped).toBe(4);
  });

  it('marks dropped after multiple wrap-around writes', () => {
    const r = new RingBuffer(4);
    r.append(Buffer.from('abcd'));
    r.append(Buffer.from('ef'));
    expect(r.snapshot().toString('utf8')).toBe('cdef');
    expect(r.dropped).toBe(2);
  });
});
