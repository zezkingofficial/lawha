import { generateKeyBetween } from 'fractional-indexing';
import type { Slot } from './types';

/** A position key that puts `id` in `to` among `list` (sorted by position). */
export function keyForSlot<T extends { id: string; position: string }>(list: T[], id: string, to: Slot): string {
  const sib = list.filter((x) => x.id !== id);
  if (to.beforeId) {
    const i = sib.findIndex((x) => x.id === to.beforeId);
    if (i >= 0) return generateKeyBetween(sib[i].position, sib[i + 1]?.position ?? null);
  }
  if (to.afterId) {
    const i = sib.findIndex((x) => x.id === to.afterId);
    if (i >= 0) return generateKeyBetween(sib[i - 1]?.position ?? null, sib[i].position);
  }
  return generateKeyBetween(sib.at(-1)?.position ?? null, null);
}
