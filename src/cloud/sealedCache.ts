type Sealed = {hash: string; ct: Uint8Array};

export class SealedCache {
  private entries: Map<string, Sealed> = new Map();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): Sealed | undefined {
    return this.entries.get(key);
  }

  keep(key: string, hash: string, ct: Uint8Array): void {
    if (this.entries.get(key)?.ct === ct) return;
    this.drop(key);
    for (const [oldKey, old] of this.entries) {
      if (this.bytes + ct.length <= this.maxBytes) break;
      this.bytes -= old.ct.length;
      this.entries.delete(oldKey);
    }
    this.entries.set(key, {hash, ct});
    this.bytes += ct.length;
  }

  drop(key: string): void {
    const had = this.entries.get(key);
    if (!had) return;
    this.bytes -= had.ct.length;
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}
