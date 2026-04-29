import { type Component, Show, createEffect, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface ErrorDialogProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

const ErrorDialog: Component<ErrorDialogProps> = (props) => {
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
      <div
        data-devid="error-dialog"
        onClick={props.onClose}
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
          <h3 data-devid="error-dialog-title" style={{ margin: '0 0 var(--space-sm) 0', 'font-size': 'var(--font-size-lg)' }}>
            {props.title}
          </h3>
          <p data-devid="error-dialog-message" style={{
            margin: '0 0 var(--space-md) 0',
            color: 'var(--text-secondary)',
            'font-size': 'var(--font-size-sm)',
            'word-break': 'break-word',
          }}>
            {props.message}
          </p>
          <div data-devid="error-dialog-actions" style={{ 'text-align': 'right' }}>
            <button
              data-devid="error-dialog-close"
              onClick={props.onClose}
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
              Close
            </button>
          </div>
        </div>
      </div>
      </Portal>
    </Show>
  );
};

export { ErrorDialog };
