export interface EnvironmentSettings {
  hdrUrl: string | null;  // null = 使用預設 RoomEnvironment
  intensity: number;      // 0-3
  rotation: number;       // 0-360 degrees
}

export const DEFAULT_ENV_SETTINGS: EnvironmentSettings = {
  hdrUrl: null,
  intensity: 1.0,
  rotation: 0,
};
