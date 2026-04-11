import { type Component, Show, createEffect, onCleanup } from 'solid-js';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <Show when={props.open}>
      <div
        onClick={props.onCancel}
        style={{
          position: 'fixed',
          inset: '0',
          background: 'rgba(0,0,0,0.5)',
          'z-index': '1000',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            'max-width': '400px',
            width: '90%',
            padding: 'var(--space-lg)',
            'border-radius': 'var(--radius-md)',
            'box-shadow': '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          <h3 style={{ margin: '0 0 var(--space-sm) 0', 'font-size': 'var(--font-size-lg)' }}>
            {props.title}
          </h3>
          <p style={{
            margin: '0 0 var(--space-md) 0',
            color: 'var(--text-secondary)',
            'font-size': 'var(--font-size-sm)',
            'word-break': 'break-word',
          }}>
            {props.message}
          </p>
          <div style={{ 'text-align': 'right', display: 'flex', gap: 'var(--space-sm)', 'justify-content': 'flex-end' }}>
            <button
              onClick={props.onCancel}
              style={{
                padding: '4px 16px',
                height: '28px',
                background: 'var(--bg-section)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-sm)',
                'font-size': 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={props.onConfirm}
              style={{
                padding: '4px 16px',
                height: '28px',
                background: 'var(--bg-section)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-sm)',
                'font-size': 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
            >
              確認
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export { ConfirmDialog };
