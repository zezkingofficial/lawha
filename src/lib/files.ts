import type { NewFile } from './data/types';

export function readFile(f: File): Promise<NewFile> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, type: f.type, size: f.size, dataUrl: String(r.result) });
    r.onerror = () => reject(r.error ?? new Error('could not read file'));
    r.readAsDataURL(f);
  });
}
