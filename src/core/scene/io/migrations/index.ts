import { v0_to_v1 } from './v0_to_v1';
import { v1_to_v2 } from './v1_to_v2';
import { v2_to_v3 } from './v2_to_v3';

export const migrations: Record<number, (data: unknown) => unknown> = {
  1: v0_to_v1,
  2: v1_to_v2,
  3: v2_to_v3,
};
