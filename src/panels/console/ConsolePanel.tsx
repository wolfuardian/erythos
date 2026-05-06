import { type Component, createEffect, For, on, onCleanup } from 'solid-js';
import { logs, clearLogs, type LogEntry } from '../../utils/consoleCapture';
import { PanelHeader } from '../../components/PanelHeader';
import styles from './ConsolePanel.module.css';

function formatArgs(args: unknown[]): string {
  return args.map(a => {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }).join(' ');
}

function levelClass(entry: LogEntry, s: typeof styles): string {
  if (entry.level === 'warn') return s.warn;
  if (entry.level === 'error') return s.error;
  return s.info;
}

const ConsolePanel: Component = () => {
  let listEl: HTMLDivElement | undefined;

  createEffect(on(logs, () => {
    if (listEl) listEl.scrollTop = listEl.scrollHeight;
  }));

  onCleanup(() => {});

  return (
    <div data-testid="console-panel" class={styles.panel}>
      <PanelHeader
        title="Console"
        actions={<button class={styles.clearBtn} onClick={clearLogs}>Clear</button>}
      />
      <div class={styles.list} ref={listEl}>
        <For each={logs()}>
          {(entry) => (
            <div class={`${styles.row} ${levelClass(entry, styles)}`}>
              <span class={styles.level}>{entry.level.toUpperCase()[0]}</span>
              <span class={styles.msg}>{formatArgs(entry.args)}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default ConsolePanel;
