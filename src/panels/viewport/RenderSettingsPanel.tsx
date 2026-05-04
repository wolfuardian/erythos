import { Show, For, type Component } from 'solid-js';
import type { LookdevPreset, ShadingMode } from '../../viewport/ShadingManager';
import type { RenderSettings } from '../../viewport/RenderSettings';
import type { QualityLevel } from '../../viewport/PostProcessing';
import { NumberDrag } from '../../components/NumberDrag';

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
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '220px',
          'max-height': 'calc(100% - 56px)',
          'overflow-y': 'auto',
          background: 'var(--bg-app)',
          'border-radius': '6px',
          border: '1px solid rgba(255,255,255,0.1)',
          'z-index': '6',
          'font-size': '11px',
          color: 'var(--text-secondary, #aaa)',
          'user-select': 'none',
        }}>
          {/* 面板 Header（可摺疊整個面板） */}
          <div
            onClick={() => props.setPanelExpanded(v => !v)}
            style={{
              padding: '8px 10px',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              cursor: 'pointer',
              'border-bottom': props.panelExpanded() ? '1px solid rgba(255,255,255,0.1)' : 'none',
            }}
          >
            <span style={{ 'font-size': '9px', width: '10px' }}>{props.panelExpanded() ? '▾' : '▸'}</span>
            <span style={{ color: 'var(--text-primary, #fff)', 'font-weight': '600' }}>Render Effects</span>
          </div>

          <Show when={props.panelExpanded()}>
            {/* ── Quality 群組 ── */}
            <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div
                onClick={() => props.toggleGroup('quality')}
                style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
              >
                <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('quality') ? '▾' : '▸'}</span>
                <span style={{ color: 'var(--text-primary, #fff)' }}>Quality</span>
              </div>
              <Show when={props.isGroupOpen('quality')}>
                <div style={{ padding: '4px 10px 8px', 'padding-left': '26px', display: 'flex', gap: '4px' }}>
                  <For each={(['low', 'normal', 'high'] as QualityLevel[])}>
                    {(q) => (
                      <button
                        onClick={() => props.setQuality(q)}
                        style={{
                          flex: 1,
                          background: props.quality() === q ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                          border: 'none',
                          color: props.quality() === q ? 'var(--text-primary, #fff)' : 'var(--text-muted, #666)',
                          padding: '3px 0',
                          cursor: 'pointer',
                          'border-radius': '3px',
                          'font-size': '10px',
                          'text-transform': 'capitalize',
                        }}
                      >
                        {q}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* ── Effects 群組（包裹所有效果子群組） ── */}
            <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div
                onClick={() => props.toggleGroup('effects')}
                style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
              >
                <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('effects') ? '▾' : '▸'}</span>
                <span style={{ color: 'var(--text-primary, #fff)' }}>Effects</span>
              </div>
              <Show when={props.isGroupOpen('effects')}>
                <div style={{ 'padding-left': '10px' }}>

                  {/* Tone Mapping */}
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div
                      onClick={() => props.toggleGroup('toneMapping')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
                    >
                      <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('toneMapping') ? '▾' : '▸'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().toneMapping.enabled}
                          onChange={e => props.updateSetting('toneMapping', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Tone Mapping</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('toneMapping') && props.renderSettings().toneMapping.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div>
                          <div style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '2px' }}>
                            <span>Mode</span>
                          </div>
                          <select
                            value={props.renderSettings().toneMapping.mode}
                            onChange={e => props.updateSetting('toneMapping', { mode: e.target.value as 'aces' | 'agx' | 'neutral' | 'reinhard' | 'cineon' })}
                            style={{
                              width: '100%',
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: 'var(--text-primary, #fff)',
                              padding: '2px 4px',
                              'border-radius': '3px',
                              'font-size': '10px',
                            }}
                          >
                            <option value="aces">ACES</option>
                            <option value="agx">AgX</option>
                            <option value="neutral">Neutral</option>
                            <option value="reinhard">Reinhard</option>
                            <option value="cineon">Cineon</option>
                          </select>
                        </div>
                        <div>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                            <span style={{ 'white-space': 'nowrap' }}>Exposure</span>
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
                      </div>
                    </Show>
                  </div>

                  {/* Bloom */}
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div
                      onClick={() => props.toggleGroup('bloom')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}
                    >
                      <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('bloom') ? '▾' : '▸'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().bloom.enabled}
                          onChange={e => props.updateSetting('bloom', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Bloom</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('bloom') && props.renderSettings().bloom.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap', 'text-transform': 'capitalize' }}>strength</span>
                          <NumberDrag
                            value={props.renderSettings().bloom.strength}
                            onChange={v => props.updateSetting('bloom', { strength: v })}
                            min={0}
                            max={3}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap', 'text-transform': 'capitalize' }}>radius</span>
                          <NumberDrag
                            value={props.renderSettings().bloom.radius}
                            onChange={v => props.updateSetting('bloom', { radius: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            precision={2}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap', 'text-transform': 'capitalize' }}>threshold</span>
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
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div onClick={() => props.toggleGroup('ao')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('ao') ? '▾' : '▸'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().ao.enabled}
                          onChange={e => props.updateSetting('ao', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Ambient Occlusion</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('ao') && props.renderSettings().ao.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Radius</span>
                          <NumberDrag
                            value={props.renderSettings().ao.radius}
                            onChange={v => props.updateSetting('ao', { radius: v })}
                            min={0.01}
                            max={0.5}
                            step={0.005}
                            precision={3}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Intensity</span>
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
                  <div style={{ 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
                    <div onClick={() => props.toggleGroup('dof')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('dof') ? '▾' : '▸'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().dof.enabled}
                          onChange={e => props.updateSetting('dof', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Depth of Field</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('dof') && props.renderSettings().dof.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px', display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Focus</span>
                          <NumberDrag
                            value={props.renderSettings().dof.focus}
                            onChange={v => props.updateSetting('dof', { focus: v })}
                            min={0.1}
                            max={100}
                            step={0.1}
                            precision={1}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Aperture</span>
                          <NumberDrag
                            value={props.renderSettings().dof.aperture}
                            onChange={v => props.updateSetting('dof', { aperture: v })}
                            min={0.001}
                            max={0.1}
                            step={0.001}
                            precision={3}
                          />
                        </div>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Max Blur</span>
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

                  {/* Motion Blur */}
                  <div>
                    <div onClick={() => props.toggleGroup('motionBlur')}
                      style={{ padding: '6px 10px', display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                      <span style={{ 'font-size': '9px', width: '10px' }}>{props.isGroupOpen('motionBlur') ? '▾' : '▸'}</span>
                      <label style={{ display: 'flex', 'align-items': 'center', gap: '6px' }} onClick={(e: MouseEvent) => e.stopPropagation()}>
                        <input type="checkbox" checked={props.renderSettings().motionBlur.enabled}
                          onChange={e => props.updateSetting('motionBlur', { enabled: e.target.checked })} />
                        <span style={{ color: 'var(--text-primary, #fff)' }}>Motion Blur</span>
                      </label>
                    </div>
                    <Show when={props.isGroupOpen('motionBlur') && props.renderSettings().motionBlur.enabled}>
                      <div style={{ padding: '2px 10px 8px', 'padding-left': '26px' }}>
                        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                          <span style={{ 'white-space': 'nowrap' }}>Strength</span>
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
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '220px',
          'max-height': 'calc(100% - 56px)',
          'overflow-y': 'auto',
          background: 'var(--bg-app)',
          'border-radius': '6px',
          border: '1px solid rgba(255,255,255,0.1)',
          'z-index': '6',
          'font-size': '11px',
          color: 'var(--text-secondary, #aaa)',
          'user-select': 'none',
        }}>
          {/* 面板 Header */}
          <div
            onClick={() => props.setShadingExpanded(v => !v)}
            style={{
              padding: '8px 10px',
              display: 'flex',
              'align-items': 'center',
              gap: '6px',
              cursor: 'pointer',
              'border-bottom': props.shadingExpanded() ? '1px solid rgba(255,255,255,0.1)' : 'none',
            }}
          >
            <span style={{ 'font-size': '9px', width: '10px' }}>{props.shadingExpanded() ? '▾' : '▸'}</span>
            <span style={{ color: 'var(--text-primary, #fff)', 'font-weight': '600' }}>Shading Controls</span>
          </div>

          <Show when={props.shadingExpanded()}>
            {/* Scene Lights */}
            <div style={{ padding: '8px 10px', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <label style={{ display: 'flex', 'align-items': 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={props.sceneLightsOn()}
                  disabled={props.renderMode() !== 'shading'}
                  onChange={e => props.onSceneLightsChange(e.target.checked)} />
                <span style={{ color: 'var(--text-primary, #fff)' }}>Scene Lights</span>
              </label>
            </div>

            {/* HDR Preset */}
            <div style={{ padding: '8px 10px', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ 'margin-bottom': '6px', color: 'var(--text-primary, #fff)' }}>HDR Preset</div>
              <select
                value={props.lookdevPreset()}
                onChange={e => props.setLookdevPreset(e.target.value as LookdevPreset)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'var(--text-primary, #fff)',
                  padding: '3px 6px',
                  'border-radius': '3px',
                  'font-size': '11px',
                }}
              >
                <option value="none">None</option>
                <option value="room">Room</option>
                <option value="factory" disabled>Factory (WIP)</option>
              </select>
            </div>

            {/* HDR Intensity */}
            <div style={{ padding: '8px 10px', 'border-bottom': '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <span style={{ 'white-space': 'nowrap' }}>Intensity</span>
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

            {/* HDR Rotation */}
            <div style={{ padding: '8px 10px' }}>
              <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
                <span style={{ 'white-space': 'nowrap' }}>Rotation</span>
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
