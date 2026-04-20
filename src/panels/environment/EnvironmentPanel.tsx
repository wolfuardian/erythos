import { For, Show, type Component } from 'solid-js';
import { useEditor } from '../../app/EditorContext';
import { PanelHeader } from '../../components/PanelHeader';

const EnvironmentPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const env = () => bridge.environmentSettings();

  const handleClear = () => {
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
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
      background: 'var(--bg-panel)',
      'box-shadow': 'var(--shadow-well-outer)',
      'border-radius': 'var(--radius-lg)',
    }}>
      {/* Header */}
      <PanelHeader title="Environment" />

      {/* Body */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '10px',
        'box-sizing': 'border-box',
        'font-size': '11px',
        color: 'var(--text-secondary, #aaa)',
      }}>

      {/* HDR Image section */}
      <div style={{ 'margin-bottom': '12px' }}>
        <div style={{ 'margin-bottom': '4px', color: 'var(--text-primary, #fff)' }}>HDR Image</div>

        <Show when={env().hdrUrl}>
          <div style={{
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
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
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
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
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
      <div
        style={{ 'margin-bottom': '8px' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
      >
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
      <div
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
      >
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
    </div>
  );
};

export default EnvironmentPanel;
