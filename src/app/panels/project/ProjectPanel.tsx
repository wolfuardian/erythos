import { createSignal, onMount, onCleanup, Show, For, type Component } from 'solid-js';
import { useEditor } from '../../EditorContext';
import { ErrorDialog } from '../../../components/ErrorDialog';
import type { ProjectEntry } from '../../../core/project/ProjectHandleStore';
import type { ProjectFile } from '../../../core/project/ProjectFile';
import { loadGLTFFromFile } from '../../../utils/gltfLoader';

const ProjectPanel: Component = () => {
  const bridge = useEditor();
  const { editor } = bridge;

  const [recentProjects, setRecentProjects] = createSignal<ProjectEntry[]>([]);
  const [errorMsg, setErrorMsg] = createSignal('');
  const [errorTitle, setErrorTitle] = createSignal('');

  const refreshRecent = async () => {
    setRecentProjects(await editor.projectManager.getRecentProjects());
  };

  onMount(() => {
    void refreshRecent();
    const unsub = editor.projectManager.onChange(() => void refreshRecent());
    onCleanup(unsub);
  });

  // ── Hub actions ──

  const handleOpen = async () => {
    try {
      await editor.projectManager.open();
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setErrorTitle('Open Failed');
        setErrorMsg(e.message || String(e));
      }
    }
  };

  const handleOpenRecent = async (id: string) => {
    try {
      const ok = await editor.projectManager.openRecent(id);
      if (!ok) {
        setErrorTitle('Permission Required');
        setErrorMsg('Could not access the project directory. Click again to grant permission.');
      }
    } catch (e: any) {
      setErrorTitle('Open Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleRemove = async (id: string, e: MouseEvent) => {
    e.stopPropagation();
    await editor.projectManager.removeRecent(id);
    await refreshRecent();
  };

  const handleClose = () => editor.projectManager.close();

  // ── Browser: categorize files ──

  const sceneFiles = () => bridge.projectFiles().filter(
    (f: ProjectFile) => f.path.startsWith('scenes/') && f.type === 'scene',
  );
  const modelFiles = () => bridge.projectFiles().filter(
    (f: ProjectFile) => f.path.startsWith('models/') && f.type === 'glb',
  );
  const textureFiles = () => bridge.projectFiles().filter(
    (f: ProjectFile) => f.path.startsWith('textures/') && f.type === 'hdr',
  );

  const handleLoadScene = async (path: string) => {
    try {
      const file = await editor.projectManager.readFile(path);
      const parsed = JSON.parse(await file.text());
      editor.loadScene(parsed);
    } catch (e: any) {
      setErrorTitle('Load Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const handleImportModel = async (path: string) => {
    try {
      const file = await editor.projectManager.readFile(path);
      await loadGLTFFromFile(file, editor);
    } catch (e: any) {
      setErrorTitle('Import Failed');
      setErrorMsg(e.message || String(e));
    }
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', 'flex-direction': 'column', overflow: 'hidden',
    }}>
      <Show when={bridge.projectOpen()} fallback={
        /* ── Hub mode ── */
        <>
          <div style={{
            padding: '6px 10px',
            'border-bottom': '1px solid var(--border-subtle)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          }}>
            <span style={{
              color: 'var(--text-muted)', 'font-size': 'var(--font-size-xs)',
              'text-transform': 'uppercase', 'letter-spacing': '0.5px',
            }}>Projects</span>
            <button onClick={handleOpen} style={{
              background: 'var(--accent-blue)', color: '#fff', border: 'none',
              padding: '2px 8px', 'border-radius': 'var(--radius-sm)',
              'font-size': 'var(--font-size-xs)', cursor: 'pointer',
            }}>Open</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
            <Show when={recentProjects().length > 0} fallback={
              <div style={{
                padding: '16px 12px', color: 'var(--text-muted)',
                'font-size': 'var(--font-size-xs)', 'text-align': 'center', 'line-height': '1.6',
              }}>
                No recent projects.<br />
                Click Open to select a<br />project directory.
              </div>
            }>
              <For each={recentProjects()}>
                {(entry) => (
                  <div
                    onClick={() => void handleOpenRecent(entry.id)}
                    style={{
                      display: 'flex', 'align-items': 'center', gap: '8px',
                      padding: '6px 10px', cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: '16px', height: '16px', 'border-radius': 'var(--radius-sm)',
                      background: 'var(--badge-mesh, #4a6fa5)', color: 'var(--text-inverse)',
                      'font-size': '9px', 'font-weight': 'bold',
                      display: 'flex', 'align-items': 'center', 'justify-content': 'center',
                      'flex-shrink': '0',
                    }}>P</span>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{
                        'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
                        overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                      }}>{entry.name}</div>
                      <div style={{ 'font-size': '10px', color: 'var(--text-muted)' }}>
                        {formatDate(entry.lastOpened)}
                      </div>
                    </div>
                    <button
                      onClick={(e: MouseEvent) => void handleRemove(entry.id, e)}
                      title="Remove from list"
                      style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', padding: '2px 4px', 'font-size': '12px',
                      }}
                    >{'\u00D7'}</button>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </>
      }>
        {/* ── Browser mode ── */}
        <>
          <div style={{
            padding: '6px 10px',
            'border-bottom': '1px solid var(--border-subtle)',
            display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          }}>
            <span style={{
              color: 'var(--text-secondary)', 'font-size': 'var(--font-size-sm)',
              'font-weight': 'bold', overflow: 'hidden', 'text-overflow': 'ellipsis',
              'white-space': 'nowrap',
            }}>{bridge.projectName()}</span>
            <button onClick={handleClose} style={{
              background: 'var(--bg-section)', color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              padding: '2px 6px', 'border-radius': 'var(--radius-sm)',
              'font-size': 'var(--font-size-xs)', cursor: 'pointer',
            }}>Close</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <FileSection title="Scenes" files={sceneFiles()} badge="S" badgeColor="#5a8a5a"
              onClick={(path: string) => void handleLoadScene(path)} />
            <FileSection title="Models" files={modelFiles()} badge="M" badgeColor="#4a6fa5"
              onClick={(path: string) => void handleImportModel(path)} />
            <FileSection title="Textures" files={textureFiles()} badge="T" badgeColor="#8a6a4a" />
            <Show when={sceneFiles().length === 0 && modelFiles().length === 0 && textureFiles().length === 0}>
              <div style={{
                padding: '16px 12px', color: 'var(--text-muted)',
                'font-size': 'var(--font-size-xs)', 'text-align': 'center', 'line-height': '1.6',
              }}>
                No assets found.<br />
                Place files in scenes/, models/,<br />or textures/ folders.
              </div>
            </Show>
          </div>
        </>
      </Show>
      <ErrorDialog open={!!errorMsg()} title={errorTitle()} message={errorMsg()} onClose={() => setErrorMsg('')} />
    </div>
  );
};

export default ProjectPanel;

/* ── Sub-component ── */

const FileSection: Component<{
  title: string;
  files: ProjectFile[];
  badge: string;
  badgeColor: string;
  onClick?: (path: string) => void;
}> = (props) => (
  <Show when={props.files.length > 0}>
    <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{
        padding: '6px 10px', color: 'var(--text-muted)',
        'font-size': 'var(--font-size-xs)', 'text-transform': 'uppercase', 'letter-spacing': '0.5px',
      }}>
        {props.title} ({props.files.length})
      </div>
      <For each={props.files}>
        {(f) => (
          <div
            onClick={() => props.onClick?.(f.path)}
            style={{
              display: 'flex', 'align-items': 'center', gap: '6px',
              padding: '5px 10px', cursor: props.onClick ? 'pointer' : 'default',
            }}
          >
            <span style={{
              width: '16px', height: '16px', 'border-radius': 'var(--radius-sm)',
              background: props.badgeColor, color: 'var(--text-inverse)',
              'font-size': '9px', 'font-weight': 'bold',
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              'flex-shrink': '0',
            }}>{props.badge}</span>
            <span style={{
              'font-size': 'var(--font-size-sm)', color: 'var(--text-secondary)',
              overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', flex: 1,
            }}>{f.name}</span>
          </div>
        )}
      </For>
    </div>
  </Show>
);
