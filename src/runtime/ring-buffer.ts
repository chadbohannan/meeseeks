export class RingBuffer {
  private buf: Buffer;
  private start = 0;
  private len = 0;
  private droppedBytes = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('capacity must be positive');
    this.buf = Buffer.alloc(capacity);
  }

  get size(): number { return this.len; }
  get dropped(): number { return this.droppedBytes; }

  append(chunk: Buffer): void {
    if (chunk.length === 0) return;
    if (chunk.length >= this.capacity) {
      const tail = chunk.subarray(chunk.length - this.capacity);
      tail.copy(this.buf, 0, 0, this.capacity);
      this.droppedBytes += this.len + (chunk.length - this.capacity);
      this.start = 0;
      this.len = this.capacity;
      return;
    }
    const overflow = this.len + chunk.length - this.capacity;
    if (overflow > 0) {
      this.start = (this.start + overflow) % this.capacity;
      this.len -= overflow;
      this.droppedBytes += overflow;
    }
    const writeAt = (this.start + this.len) % this.capacity;
    const firstSpan = Math.min(chunk.length, this.capacity - writeAt);
    chunk.copy(this.buf, writeAt, 0, firstSpan);
    if (firstSpan < chunk.length) {
      chunk.copy(this.buf, 0, firstSpan, chunk.length);
    }
    this.len += chunk.length;
  }

  snapshot(): Buffer {
    if (this.len === 0) return Buffer.alloc(0);
    const out = Buffer.alloc(this.len);
    const firstSpan = Math.min(this.len, this.capacity - this.start);
    this.buf.copy(out, 0, this.start, this.start + firstSpan);
    if (firstSpan < this.len) {
      this.buf.copy(out, firstSpan, 0, this.len - firstSpan);
    }
    return out;
  }
}
