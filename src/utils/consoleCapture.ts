import { createSignal } from 'solid-js';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  level: LogLevel;
  args: unknown[];
  timestamp: number;
}

const MAX_ENTRIES = 500;
let _id = 0;

const [logs, setLogs] = createSignal<LogEntry[]>([]);
export { logs };

export function clearLogs(): void {
  setLogs([]);
}

export function installConsoleCapture(): void {
  const wrap = (level: LogLevel, original: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      original(...args);
      const entry: LogEntry = { id: _id++, level, args, timestamp: Date.now() };
      setLogs(prev => {
        const next = [...prev, entry];
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
      });
    };
  };

  console.log   = wrap('log',   console.log.bind(console));
  console.info  = wrap('info',  console.info.bind(console));
  console.warn  = wrap('warn',  console.warn.bind(console));
  console.error = wrap('error', console.error.bind(console));
}
