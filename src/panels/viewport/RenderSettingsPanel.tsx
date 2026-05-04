import { Show, For, type Component } from 'solid-js';
import type { LookdevPreset, ShadingMode } from '../../viewport/ShadingManager';
import type { RenderSettings } from '../../viewport/RenderSettings';
import type { QualityLevel } from '../../viewport/PostProcessing';
import { NumberDrag } from '../../components/NumberDrag';
import styles from './RenderSettingsPanel.module.css';

interface RenderSettingsPanelProps {
  // Rendering panel
  panelExpanded: () => boolean;
  setPanelExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  renderSettings: () => RenderSettings;
  updateSetting: <K extends keyof RenderSettings>(key: K, patch: Partial<RenderSettings[K]>) => void;
  quality: () => QualityLevel;
  setQuality: (q: QualityLevel) => void;
  isGroupOpen: (key: string) => boolean;
  toggleGroup: (key: string) => void;
  // Shading panel
  renderMode: () => ShadingMode;
  shadingExpanded: () => boolean;
  setShadingExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  sceneLightsOn: () => boolean;
  onSceneLightsChange: (checked: boolean) => void;
  hdrIntensity: () => number;
  setHdrIntensity: (v: number) => void;
  hdrRotation: () => number;
  setHdrRotation: (v: number) => void;
  lookdevPreset: () => LookdevPreset;
  setLookdevPreset: (v: LookdevPreset) => void;
}

export const RenderSettingsPanel: Component<RenderSettingsPanelProps> = (props) => {
  return (
    <>
      {/* Rendering 懸浮面板 */}
      <Show when={props.renderMode() === 'rendering'}>
        <div class={styles.panel}>
          {/* 面板 Header（可摺疊整個面板） */}
          <div
            class={styles.panelHeader}
            classList={{ [styles.expanded]: props.panelExpanded() }}
            onClick={() => props.setPanelExpanded(v => !v)}
          >
            <span class={styles.caret}>{props.panelExpanded() ? '▾' : '▸'}</span>
            <span class={styles.panelTitle}>Render Effects</span>
          </div>

          <Show when={props.panelExpanded()}>
            {/* ── Quality 群組 ── */}
            <div class={styles.section}>
              <div
                class={styles.groupHeader}
                onClick={() => props.toggleGroup('quality')}
              >
                <span class={styles.caret}>{props.isGroupOpen('quality') ? '▾' : '▸'}</span>
                <span class={styles.groupName}>Quality</span>
              </div>
              <Show when={props.isGroupOpen('quality')}>
                <div class={styles.qualityRow}>
                  <For each={(['low', 'normal', 'high'] as QualityLevel[])}>
                    {(q) => (
                      <button
                        class={styles.qualityBtn}
                        classList={{ [styles.active]: props.quality() === q }}
                        onClick={() => props.setQuality(q)}
                      >
                        {q}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* ── Effects 群組（包裹所有效果子群組） ── */}
            <div class={styles.section}>
              <div
                class={styles.groupHeader}
                onClick={() => props.toggleGroup('effects')}
              >
                <span class={styles.caret}>{props.isGroupOpen('effects') ? '▾' : '▸'}</span>
                <span class={styles.groupName}>Effects</span>
              </div>
              <Show when={props.isGroupOpen('effects')}>
                <div class={styles.effectsBody}>

                  {/* Tone Mapping */}
                  <div class={styles.section}>
                    <div
                      class={styles.groupHeader}
                      onClick={() => props.toggleGroup('toneMapping')}
                    >
                      <span class={styles.caret}>{props.isGroupOpen('toneMapping') ? '▾' : '▸'}</span>
                      <label class={styles.groupHeaderLabel} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().toneMapping.enabled}
                          onChange={e => props.updateSetting('toneMapping', { enabled: e.target.checked })} />
                        <span class={styles.groupName}>Tone Mapping</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('toneMapping') && props.renderSettings().toneMapping.enabled}>
                      <div class={styles.groupBody}>
                        <div>
                          <div class={styles.subLabel}>
                            <span>Mode</span>
                          </div>
                          <select
                            class={styles.selectSm}
                            value={props.renderSettings().toneMapping.mode}
                            onChange={e => props.updateSetting('toneMapping', { mode: e.target.value as 'aces' | 'agx' | 'neutral' | 'reinhard' | 'cineon' })}
                          >
                            <option value="aces">ACES</option>
                            <option value="agx">AgX</option>
                            <option value="neutral">Neutral</option>
                            <option value="reinhard">Reinhard</option>
                            <option value="cineon">Cineon</option>
                          </select>
                        </div>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Exposure</span>
                          <NumberDrag
                            value={props.renderSettings().toneMapping.exposure}
                            onChange={v => props.updateSetting('toneMapping', { exposure: v })}
                            min={0.1}
                            max={3}
                            step={0.05}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* Bloom */}
                  <div class={styles.section}>
                    <div
                      class={styles.groupHeader}
                      onClick={() => props.toggleGroup('bloom')}
                    >
                      <span class={styles.caret}>{props.isGroupOpen('bloom') ? '▾' : '▸'}</span>
                      <label class={styles.groupHeaderLabel} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().bloom.enabled}
                          onChange={e => props.updateSetting('bloom', { enabled: e.target.checked })} />
                        <span class={styles.groupName}>Bloom</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('bloom') && props.renderSettings().bloom.enabled}>
                      <div class={styles.groupBody}>
                        <div class={styles.field}>
                          <span class={styles.fieldLabelCapitalize}>strength</span>
                          <NumberDrag
                            value={props.renderSettings().bloom.strength}
                            onChange={v => props.updateSetting('bloom', { strength: v })}
                            min={0}
                            max={3}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                        <div class={styles.field}>
                          <span class={styles.fieldLabelCapitalize}>radius</span>
                          <NumberDrag
                            value={props.renderSettings().bloom.radius}
                            onChange={v => props.updateSetting('bloom', { radius: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                        <div class={styles.field}>
                          <span class={styles.fieldLabelCapitalize}>threshold</span>
                          <NumberDrag
                            value={props.renderSettings().bloom.threshold}
                            onChange={v => props.updateSetting('bloom', { threshold: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* AO */}
                  <div class={styles.section}>
                    <div
                      class={styles.groupHeader}
                      onClick={() => props.toggleGroup('ao')}
                    >
                      <span class={styles.caret}>{props.isGroupOpen('ao') ? '▾' : '▸'}</span>
                      <label class={styles.groupHeaderLabel} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().ao.enabled}
                          onChange={e => props.updateSetting('ao', { enabled: e.target.checked })} />
                        <span class={styles.groupName}>Ambient Occlusion</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('ao') && props.renderSettings().ao.enabled}>
                      <div class={styles.groupBody}>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Radius</span>
                          <NumberDrag
                            value={props.renderSettings().ao.radius}
                            onChange={v => props.updateSetting('ao', { radius: v })}
                            min={0.01}
                            max={0.5}
                            step={0.005}
                            precision={3}
                          />
                        </div>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Intensity</span>
                          <NumberDrag
                            value={props.renderSettings().ao.intensity}
                            onChange={v => props.updateSetting('ao', { intensity: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* DOF */}
                  <div class={styles.section}>
                    <div
                      class={styles.groupHeader}
                      onClick={() => props.toggleGroup('dof')}
                    >
                      <span class={styles.caret}>{props.isGroupOpen('dof') ? '▾' : '▸'}</span>
                      <label class={styles.groupHeaderLabel} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().dof.enabled}
                          onChange={e => props.updateSetting('dof', { enabled: e.target.checked })} />
                        <span class={styles.groupName}>Depth of Field</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('dof') && props.renderSettings().dof.enabled}>
                      <div class={styles.groupBody}>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Focus</span>
                          <NumberDrag
                            value={props.renderSettings().dof.focus}
                            onChange={v => props.updateSetting('dof', { focus: v })}
                            min={0.1}
                            max={100}
                            step={0.1}
                            precision={1}
                          />
                        </div>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Aperture</span>
                          <NumberDrag
                            value={props.renderSettings().dof.aperture}
                            onChange={v => props.updateSetting('dof', { aperture: v })}
                            min={0.001}
                            max={0.1}
                            step={0.001}
                            precision={3}
                          />
                        </div>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Max Blur</span>
                          <NumberDrag
                            value={props.renderSettings().dof.maxBlur}
                            onChange={v => props.updateSetting('dof', { maxBlur: v })}
                            min={0.001}
                            max={0.05}
                            step={0.001}
                            precision={3}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* Motion Blur — last child, no section border */}
                  <div>
                    <div
                      class={styles.groupHeader}
                      onClick={() => props.toggleGroup('motionBlur')}
                    >
                      <span class={styles.caret}>{props.isGroupOpen('motionBlur') ? '▾' : '▸'}</span>
                      <label class={styles.groupHeaderLabel} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().motionBlur.enabled}
                          onChange={e => props.updateSetting('motionBlur', { enabled: e.target.checked })} />
                        <span class={styles.groupName}>Motion Blur</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('motionBlur') && props.renderSettings().motionBlur.enabled}>
                      <div class={styles.groupBody}>
                        <div class={styles.field}>
                          <span class={styles.fieldLabel}>Strength</span>
                          <NumberDrag
                            value={props.renderSettings().motionBlur.strength}
                            onChange={v => props.updateSetting('motionBlur', { strength: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                      </div>
                    </Show>
                  </div>

                </div>
              </Show>
            </div>
          </Show>
        </div>
      </Show>

      {/* Shading 懸浮面板 */}
      <Show when={props.renderMode() === 'shading'}>
        <div class={styles.panel}>
          {/* 面板 Header */}
          <div
            class={styles.panelHeader}
            classList={{ [styles.expanded]: props.shadingExpanded() }}
            onClick={() => props.setShadingExpanded(v => !v)}
          >
            <span class={styles.caret}>{props.shadingExpanded() ? '▾' : '▸'}</span>
            <span class={styles.panelTitle}>Shading Controls</span>
          </div>

          <Show when={props.shadingExpanded()}>
            {/* Scene Lights */}
            <div class={styles.settingRow} classList={{ [styles.bordered]: true }}>
              <label class={styles.settingLabel}>
                <input type="checkbox" checked={props.sceneLightsOn()}
                  disabled={props.renderMode() !== 'shading'}
                  onChange={e => props.onSceneLightsChange(e.target.checked)} />
                <span class={styles.primaryText}>Scene Lights</span>
              </label>
            </div>

            {/* HDR Preset */}
            <div class={styles.settingRow} classList={{ [styles.bordered]: true }}>
              <div class={styles.settingGroupLabel}>HDR Preset</div>
              <select
                class={styles.selectMd}
                value={props.lookdevPreset()}
                onChange={e => props.setLookdevPreset(e.target.value as LookdevPreset)}
              >
                <option value="none">None</option>
                <option value="room">Room</option>
                <option value="factory" disabled>Factory (WIP)</option>
              </select>
            </div>

            {/* HDR Intensity */}
            <div class={styles.settingRow} classList={{ [styles.bordered]: true }}>
              <div class={styles.field}>
                <span class={styles.fieldLabel}>Intensity</span>
                <NumberDrag
                  value={props.hdrIntensity()}
                  onChange={v => props.setHdrIntensity(v)}
                  min={0}
                  max={3}
                  step={0.05}
                  precision={2}
                />
              </div>
            </div>

            {/* HDR Rotation — last row, no border */}
            <div class={styles.settingRow}>
              <div class={styles.field}>
                <span class={styles.fieldLabel}>Rotation</span>
                <NumberDrag
                  value={props.hdrRotation()}
                  onChange={v => props.setHdrRotation(Math.round(v))}
                  min={0}
                  max={360}
                  step={1}
                  precision={0}
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </>
  );
};
