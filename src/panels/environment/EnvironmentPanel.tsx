import { createSignal, For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';

const EnvironmentPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [urlInput, setUrlInput] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  const env = () => bridge.environmentSettings();

  const handleLoad = () => {
    const url = urlInput().trim();
    if (!url) return;
    setError(null);
    // 只更新設定，實際載入由 ViewportPanel 負責（監聽 environmentChanged 事件）
    editor.setEnvironmentSettings({ hdrUrl: url });
  };

  const handleClear = () => {
    setUrlInput('');
    setError(null);
    editor.setEnvironmentSettings({ hdrUrl: null });
  };

  const handleIntensity = (value: number) => {
    editor.setEnvironmentSettings({ intensity: value });
  };

  const handleRotation = (value: number) => {
    editor.setEnvironmentSettings({ rotation: value });
  };

  const projectHdrFiles = () => bridge.projectFiles().filter((f) => f.type === 'hdr');

  const handleSelectFromProject = async (path: string) => {
    if (!path) return;
    const file = await editor.projectManager.readFile(path);
    const blob = new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    editor.setEnvironmentSettings({ hdrUrl: url });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      overflow: 'auto',
      padding: '10px',
      'box-sizing': 'border-box',
      'font-size': '11px',
      color: 'var(--text-secondary, #aaa)',
    }}>
      {/* Header */}
      <div style={{
        color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)',
        'text-transform': 'uppercase',
        'letter-spacing': '0.5px',
        'margin-bottom': '12px',
      }}>
        Environment
      </div>

      {/* HDR URL */}
      <div style={{ 'margin-bottom': '12px' }}>
        <div style={{ 'margin-bottom': '4px', color: 'var(--text-primary, #fff)' }}>HDR Image</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            placeholder="Enter .hdr URL..."
            value={urlInput()}
            onInput={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLoad(); }}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-primary, #fff)',
              padding: '4px 6px',
              'border-radius': '3px',
              'font-size': '11px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleLoad}
            disabled={!urlInput().trim()}
            style={{
              background: 'rgba(74,127,191,0.3)',
              border: 'none',
              color: 'var(--text-primary, #fff)',
              padding: '4px 10px',
              'border-radius': '3px',
              cursor: 'pointer',
              'font-size': '11px',
              opacity: urlInput().trim() ? 1 : 0.5,
            }}
          >
            Load
          </button>
        </div>

        <Show when={env().hdrUrl}>
          <div style={{
            'margin-top': '4px',
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
          }}>
            <span style={{
              color: 'var(--accent-green, #6c6)',
              'font-size': '10px',
              overflow: 'hidden',
              'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
              flex: 1,
            }}>
              {env().hdrUrl}
            </span>
            <button
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                'font-size': '12px',
                'flex-shrink': 0,
                padding: '0 4px',
              }}
            >×</button>
          </div>
        </Show>

        <Show when={error()}>
          <div style={{ color: '#f66', 'font-size': '10px', 'margin-top': '4px' }}>
            {error()}
          </div>
        </Show>
      </div>

      {/* Project HDR Dropdown */}
      <Show when={bridge.projectOpen()}>
        <div style={{ 'margin-bottom': '12px' }}>
          <div style={{ 'margin-bottom': '4px', color: 'var(--text-primary, #fff)' }}>From Project</div>
          <select
            value=""
            onChange={(e) => void handleSelectFromProject(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-primary, #fff)',
              padding: '4px 6px',
              'border-radius': '3px',
              'font-size': '11px',
            }}
          >
            <option value="">From project…</option>
            <For each={projectHdrFiles()}>
              {(f) => <option value={f.path}>{f.name || f.path}</option>}
            </For>
          </select>
        </div>
      </Show>

      {/* Intensity */}
      <div style={{ 'margin-bottom': '8px' }}>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '2px' }}>
          <span>Intensity</span>
          <span>{env().intensity.toFixed(2)}</span>
        </div>
        <input type="range" min="0" max="3" step="0.05"
          value={env().intensity}
          onInput={e => handleIntensity(parseFloat(e.target.value))}
          style={{ width: '100%' }} />
      </div>

      {/* Rotation */}
      <div>
        <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '2px' }}>
          <span>Rotation</span>
          <span>{env().rotation}°</span>
        </div>
        <input type="range" min="0" max="360" step="1"
          value={env().rotation}
          onInput={e => handleRotation(parseInt(e.target.value))}
          style={{ width: '100%' }} />
      </div>
    </div>
  );
};

export default EnvironmentPanel;
