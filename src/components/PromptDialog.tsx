import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const PromptDialog: Component<PromptDialogProps> = (props) => {
  const [value, setValue] = createSignal('');
  const [confirmHovered, setConfirmHovered] = createSignal(false);
  const [cancelHovered, setCancelHovered] = createSignal(false);
  let inputRef!: HTMLInputElement;

  // Reset input value when dialog opens and focus it
  createEffect(() => {
    if (!props.open) return;
    setValue('');
    // Focus input on next tick after mount
    requestAnimationFrame(() => inputRef?.focus());
  });

  // ESC to cancel, Enter to confirm
  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { props.onCancel(); }
      if (e.key === 'Enter' && value().trim()) { props.onConfirm(value().trim()); }
    };
    document.addEventListener('keydown', onKeyDown);
    onCleanup(() => document.removeEventListener('keydown', onKeyDown));
  });

  const handleConfirm = () => {
    const v = value().trim();
    if (!v) return;
    props.onConfirm(v);
  };

  return (
    <Show when={props.open}>
      <Portal>
        <div
          data-testid="prompt-dialog"
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
            <h3 data-testid="prompt-dialog-title" style={{ margin: '0 0 var(--space-sm) 0', 'font-size': 'var(--font-size-lg)' }}>
              {props.title}
            </h3>
            <Show when={props.message}>
              <p data-testid="prompt-dialog-message" style={{
                margin: '0 0 var(--space-sm) 0',
                color: 'var(--text-secondary)',
                'font-size': 'var(--font-size-sm)',
              }}>
                {props.message}
              </p>
            </Show>
            <input
              data-testid="prompt-dialog-input"
              ref={inputRef}
              type="text"
              placeholder={props.placeholder ?? ''}
              value={value()}
              onInput={(e) => setValue(e.currentTarget.value)}
              style={{
                width: '100%',
                'box-sizing': 'border-box',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                'border-radius': 'var(--radius-sm)',
                padding: '5px 8px',
                'font-size': 'var(--font-size-sm)',
                'box-shadow': 'var(--shadow-input-inset)',
                outline: 'none',
                'margin-bottom': 'var(--space-md)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent-gold)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            />
            <div data-testid="prompt-dialog-actions" style={{ 'text-align': 'right', display: 'flex', gap: 'var(--space-sm)', 'justify-content': 'flex-end' }}>
              <button
                data-testid="prompt-dialog-cancel"
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
                data-testid="prompt-dialog-confirm"
                onClick={handleConfirm}
                disabled={!value().trim()}
                onMouseEnter={() => setConfirmHovered(true)}
                onMouseLeave={() => setConfirmHovered(false)}
                style={{
                  padding: '4px 16px',
                  height: '28px',
                  background: !value().trim()
                    ? 'var(--bg-section)'
                    : confirmHovered()
                      ? 'var(--accent-blue-hover)'
                      : 'var(--accent-blue)',
                  color: !value().trim() ? 'var(--text-muted)' : 'white',
                  border: 'none',
                  'border-radius': 'var(--radius-sm)',
                  'font-size': 'var(--font-size-sm)',
                  cursor: !value().trim() ? 'default' : 'pointer',
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

export { PromptDialog };
