import { createSignal, For, type Component } from 'solid-js';
import { Portal } from 'solid-js/web';

export type Template = 'empty' | 'default-lights' | 'studio';

interface Props {
  onClose: () => void;
  onCreate: (name: string, template: Template) => Promise<void>;
}

const TEMPLATES: Array<{ id: Template; label: string }> = [
  { id: 'empty',          label: 'Empty' },
  { id: 'default-lights', label: 'Default Lights' },
  { id: 'studio',         label: 'Studio' },
];

export function buildSceneJson(template: Template): string {
  const base = { version: 1, nodes: [] as object[] };
  const node = (id: string, name: string, components: object) => ({
    id, name, parent: null, order: 0,
    position: [0,0,0], rotation: [0,0,0], scale: [1,1,1],
    components, userData: {},
  });

  if (template === 'empty') {
    return JSON.stringify(base, null, 2);
  }
  if (template === 'default-lights') {
    return JSON.stringify({
      ...base,
      nodes: [
        node('dl-ambient-1', 'Ambient Light', { light: { type: 'ambient', color: 0xffffff, intensity: 0.4 } }),
        node('dl-dir-1',     'Directional Light', { light: { type: 'directional', color: 0xffffff, intensity: 1 } }),
      ],
    }, null, 2);
  }
  // studio — three-point lighting
  return JSON.stringify({
    ...base,
    nodes: [
      node('st-key',   'Key Light',   { light: { type: 'directional', color: 0xffffff, intensity: 1.2 } }),
      node('st-fill',  'Fill Light',  { light: { type: 'directional', color: 0xffffff, intensity: 0.6 } }),
      node('st-back',  'Back Light',  { light: { type: 'directional', color: 0xffffff, intensity: 0.8 } }),
    ],
  }, null, 2);
}

export const NewSceneDialog: Component<Props> = (props) => {
  const [name, setName] = createSignal('untitled');
  const [template, setTemplate] = createSignal<Template>('empty');
  const [localErr, setLocalErr] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  const displayName = () => {
    const n = name();
    return n.endsWith('.scene.json') ? n : n + '.scene.json';
  };

  const validate = () => {
    const n = name().trim();
    if (!n) return 'Name cannot be empty';
    if (n.includes('/') || n.includes('\\')) return 'Name cannot contain / or \\';
    return '';
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) { setLocalErr(err); return; }
    setBusy(true);
    try {
      await props.onCreate(displayName(), template());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
    <div
      data-devid="new-scene-dialog"
      style={{
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', 'align-items': 'center', 'justify-content': 'center',
        'z-index': '1000',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-medium)',
        'border-radius': 'var(--radius-lg)',
        'box-shadow': 'var(--shadow-popup)',
        padding: 'var(--space-2xl)',
        width: '360px',
        display: 'flex', 'flex-direction': 'column', gap: 'var(--space-xl)',
      }}>
        {/* Title */}
        <div data-devid="new-scene-dialog-title" style={{ 'font-size': 'var(--font-size-xl)', 'font-weight': '600', color: 'var(--text-primary)' }}>
          Create New Scene
        </div>

        {/* Name input */}
        <div data-devid="new-scene-dialog-name-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
          <label style={{
            'font-size': 'var(--font-size-xs)', color: 'var(--text-muted)',
            'text-transform': 'uppercase', 'letter-spacing': '0.6px', 'font-weight': '600',
          }}>Scene Name</label>
          <input
            data-devid="new-scene-dialog-name-input"
            value={name()}
            onInput={(e) => { setName(e.currentTarget.value); setLocalErr(''); }}
            placeholder="untitled"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              'border-radius': 'var(--radius-md)',
              padding: 'var(--space-md) var(--space-lg)',
              color: 'var(--text-primary)',
              'font-size': 'var(--font-size-md)',
              'box-shadow': 'var(--shadow-input-inset)',
              outline: 'none',
              width: '100%', 'box-sizing': 'border-box',
            }}
            onFocus={(e) => { e.currentTarget.style.outline = '1px solid var(--accent-gold)'; }}
            onBlur={(e) => { e.currentTarget.style.outline = 'none'; }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') props.onClose(); }}
          />
          <div style={{ 'font-size': 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            Will save as <strong>{displayName()}</strong>
          </div>
        </div>

        {/* Template chip group */}
        <div data-devid="new-scene-dialog-template-field" style={{ display: 'flex', 'flex-direction': 'column', gap: 'var(--space-sm)' }}>
          <label style={{
            'font-size': 'var(--font-size-xs)', color: 'var(--text-muted)',
            'text-transform': 'uppercase', 'letter-spacing': '0.6px', 'font-weight': '600',
          }}>Template</label>
          <div data-devid="new-scene-dialog-template-options" style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <For each={TEMPLATES}>{(t) =>
              <button
                data-devid={`new-scene-dialog-template-${t.id}`}
                onClick={() => setTemplate(t.id)}
                style={{
                  flex: '1',
                  background: template() === t.id ? 'var(--accent-blue)' : 'var(--bg-section)',
                  border: `1px solid ${template() === t.id ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  'border-radius': 'var(--radius-md)',
                  padding: 'var(--space-sm) var(--space-md)',
                  color: template() === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  'font-size': 'var(--font-size-sm)',
                  cursor: 'pointer',
                  'white-space': 'nowrap',
                }}
              >{t.label}</button>
            }</For>
          </div>
        </div>

        {/* Inline error */}
        {localErr() && (
          <div data-devid="new-scene-dialog-error" style={{ 'font-size': 'var(--font-size-xs)', color: 'var(--accent-red)' }}>
            {localErr()}
          </div>
        )}

        {/* Actions */}
        <div data-devid="new-scene-dialog-actions" style={{ display: 'flex', gap: 'var(--space-md)', 'justify-content': 'flex-end' }}>
          <button
            data-devid="new-scene-dialog-cancel"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              'border-radius': 'var(--radius-md)',
              padding: 'var(--space-md) var(--space-xl)',
              color: 'var(--text-secondary)',
              'font-size': 'var(--font-size-md)',
              cursor: 'pointer',
            }}
            onClick={props.onClose}
          >Cancel</button>
          <button
            data-devid="new-scene-dialog-create"
            disabled={busy()}
            style={{
              background: busy() ? 'var(--bg-section)' : 'var(--accent-blue)',
              border: '1px solid transparent',
              'border-radius': 'var(--radius-md)',
              padding: 'var(--space-md) var(--space-xl)',
              color: busy() ? 'var(--text-muted)' : 'var(--text-primary)',
              'font-size': 'var(--font-size-md)',
              cursor: busy() ? 'default' : 'pointer',
            }}
            onClick={() => void handleCreate()}
          >Create</button>
        </div>
      </div>
    </div>
    </Portal>
  );
};
