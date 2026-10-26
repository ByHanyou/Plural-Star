import {config, LOG_LEVELS, type LogLevel} from '../config';

export interface LogEntry {
  at: number;
  level: LogLevel;
  tag: string;
  message: string;
}

const RING_MAX = 300;
const ring: LogEntry[] = [];
const listeners = new Set<() => void>();

const rank = (level: LogLevel): number => LOG_LEVELS.indexOf(level);

const describe = (v: unknown): string => {
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
};

const write = (level: LogLevel, tag: string, args: unknown[]): void => {
  if (rank(level) < rank(config().logLevel)) return;
  const message = args.map(describe).join(' ');
  ring.push({at: Date.now(), level, tag, message});
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  const line = `[${tag}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  listeners.forEach(fn => fn());
};

export const log = {
  debug: (tag: string, ...args: unknown[]): void => write('debug', tag, args),
  info: (tag: string, ...args: unknown[]): void => write('info', tag, args),
  warn: (tag: string, ...args: unknown[]): void => write('warn', tag, args),
  error: (tag: string, ...args: unknown[]): void => write('error', tag, args),
};

export const logError = (tag: string, e: unknown): void => write('warn', tag, [e]);

export const recentLogs = (): readonly LogEntry[] => ring;

export const onLog = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const errorMessage = (e: unknown): string =>
  String((e as {message?: unknown} | null)?.message || e || '');
