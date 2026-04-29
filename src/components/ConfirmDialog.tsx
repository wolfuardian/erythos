import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' uses --accent-red for destructive actions; defaults to 'default' (blue) */
  variant?: 'default' | 'danger';
}

const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  const [confirmHovered, setConfirmHovered] = createSignal(false);
  const [cancelHovered, setCancelHovered] = createSignal(false);

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
      <Portal>
      <div
        data-devid="confirm-dialog"
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
            'border-radius': 'var(--radius-lg)',
            'box-shadow': 'var(--shadow-well-outer)',
          }}
        >
          <h3 data-devid="confirm-dialog-title" style={{ margin: '0 0 var(--space-sm) 0', 'font-size': 'var(--font-size-lg)' }}>
            {props.title}
          </h3>
          <p data-devid="confirm-dialog-message" style={{
            margin: '0 0 var(--space-md) 0',
            color: 'var(--text-secondary)',
            'font-size': 'var(--font-size-sm)',
            'word-break': 'break-word',
          }}>
            {props.message}
          </p>
          <div data-devid="confirm-dialog-actions" style={{ 'text-align': 'right', display: 'flex', gap: 'var(--space-sm)', 'justify-content': 'flex-end' }}>
            <button
              data-devid="confirm-dialog-cancel"
              onClick={props.onCancel}
              onMouseEnter={() => setCancelHovered(true)}
              onMouseLeave={() => setCancelHovered(false)}
              style={{
                padding: '4px 16px',
                height: '28px',
                background: cancelHovered() ? 'var(--bg-hover)' : 'var(--bg-section)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-sm)',
                'font-size': 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
            >
              {props.cancelLabel ?? 'Cancel'}
            </button>
            <button
              data-devid="confirm-dialog-confirm"
              onClick={props.onConfirm}
              onMouseEnter={() => setConfirmHovered(true)}
              onMouseLeave={() => setConfirmHovered(false)}
              style={{
                padding: '4px 16px',
                height: '28px',
                background: props.variant === 'danger'
                  ? (confirmHovered() ? 'var(--accent-red-hover)' : 'var(--accent-red)')
                  : (confirmHovered() ? 'var(--accent-blue-hover)' : 'var(--accent-blue)'),
                color: 'white',
                'border-radius': 'var(--radius-sm)',
                'font-size': 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
            >
              {props.confirmLabel ?? 'OK'}
            </button>
          </div>
        </div>
      </div>
      </Portal>
    </Show>
  );
};

export { ConfirmDialog };
