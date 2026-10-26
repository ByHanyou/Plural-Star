import {logError} from './log';

export class Emitter<A extends unknown[]> {
  private readonly listeners = new Set<(...args: A) => void>();

  constructor(private readonly tag: string) {}

  on(fn: (...args: A) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(...args: A): void {
    this.listeners.forEach(fn => {
      try {
        fn(...args);
      } catch (e) {
        logError(this.tag, e);
      }
    });
  }
}
