import { For, Show, type Component } from 'solid-js';
import type { ProjectFile } from '../../core/project/ProjectFile';
import styles from './AssetBrowser.module.css';

export interface AssetBrowserProps {
  /** All project files (filtered externally or here) */
  projectFiles: ProjectFile[];
  /** Called when user clicks "Open" on a prefab */
  onOpenPrefab: (file: ProjectFile) => void;
}

/**
 * AssetBrowser — left-side panel in WorkshopPanel.
 *
 * Shows two sections:
 *  - .glb files: draggable into the 3D viewport
 *  - .prefab files: openable via "Open" button
 *
 * Drag payload for glb: 'application/erythos-asset' = JSON.stringify({ type: 'glb', path })
 */
const AssetBrowser: Component<AssetBrowserProps> = (props) => {
  const glbFiles = () => props.projectFiles.filter(f => f.type === 'glb');
  const prefabFiles = () => props.projectFiles.filter(f => f.type === 'prefab');

  return (
    <div class={styles.browser}>
      {/* GLB section */}
      <div class={styles.sectionHeader}>Models (.glb)</div>
      <Show
        when={glbFiles().length > 0}
        fallback={<div class={styles.emptyHint}>No .glb files</div>}
      >
        <For each={glbFiles()}>
          {(file) => (
            <div
              class={styles.assetItem}
              draggable
              onDragStart={(e) => {
                e.dataTransfer!.setData(
                  'application/erythos-asset',
                  JSON.stringify({ type: 'glb', path: file.path }),
                );
                e.dataTransfer!.effectAllowed = 'copy';
              }}
              title={file.path}
            >
              <span class={styles.assetIcon}>▣</span>
              <span class={styles.assetName}>{file.name}</span>
            </div>
          )}
        </For>
      </Show>

      {/* Divider */}
      <div class={styles.divider} />

      {/* Prefab section */}
      <div class={styles.sectionHeader}>Prefabs</div>
      <Show
        when={prefabFiles().length > 0}
        fallback={<div class={styles.emptyHint}>No .prefab files</div>}
      >
        <For each={prefabFiles()}>
          {(file) => (
            <div class={styles.assetItem} title={file.path}>
              <span class={styles.assetIcon}>◈</span>
              <span class={styles.assetName}>{file.name.replace(/\.prefab$/, '')}</span>
              <button
                class={styles.openBtn}
                onClick={() => props.onOpenPrefab(file)}
                title={`Open ${file.path} in sandbox`}
              >
                Open
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
};

export default AssetBrowser;
