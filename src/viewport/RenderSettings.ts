import { ACESFilmicToneMapping, NoToneMapping } from 'three';

export interface ToneMappingSettings { enabled: boolean; exposure: number; }
export interface BloomSettings       { enabled: boolean; strength: number; radius: number; threshold: number; }
export interface AOSettings          { enabled: boolean; radius: number; intensity: number; }
export interface DOFSettings         { enabled: boolean; focus: number; aperture: number; maxBlur: number; }
export interface MotionBlurSettings  { enabled: boolean; strength: number; }

export interface RenderSettings {
  toneMapping:  ToneMappingSettings;
  bloom:        BloomSettings;
  ao:           AOSettings;
  dof:          DOFSettings;
  motionBlur:   MotionBlurSettings;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  toneMapping:  { enabled: true,  exposure: 1.0 },
  bloom:        { enabled: false, strength: 0.5, radius: 0.4, threshold: 0.85 },
  ao:           { enabled: false, radius: 0.1, intensity: 0.5 },
  dof:          { enabled: false, focus: 5.0, aperture: 0.025, maxBlur: 0.01 },
  motionBlur:   { enabled: false, strength: 0.7 },
};

export { ACESFilmicToneMapping, NoToneMapping };
