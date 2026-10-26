import {logError} from './log';

export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

export const parallelMap = async <T, U>(
  items: T[],
  worker: (item: T, index: number) => Promise<U>,
  concurrency = 6,
  onProgress?: (done: number, total: number) => void,
): Promise<(U | undefined)[]> => {
  const total = items.length;
  const results: (U | undefined)[] = new Array(total);
  if (total === 0) return results;
  let nextIndex = 0;
  let completed = 0;
  const runOne = async (): Promise<void> => {
    while (true) {
      const i = nextIndex++;
      if (i >= total) return;
      try { results[i] = await worker(items[i], i); }
      catch (e) { results[i] = undefined; logError('utils', e); }
      completed++;
      if (onProgress) { try { onProgress(completed, total); } catch (e) { logError('utils', e); } }
    }
  };
  const lanes = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({length: lanes}, () => runOne()));
  return results;
};

export const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      v => { if (settled) return; settled = true; clearTimeout(timer); resolve(v); },
      e => { if (settled) return; settled = true; clearTimeout(timer); reject(e); },
    );
  });
