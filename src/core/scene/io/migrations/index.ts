import { v0_to_v1 } from './v0_to_v1';

export const migrations: Record<number, (data: unknown) => unknown> = {
  1: v0_to_v1,
};
