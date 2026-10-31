import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { downloadFile } from './project';

export type SaveResult = { saved: boolean; where: string };

/**
 * Dışa aktarılan dosyayı kaydeder. Masaüstünde yerel "Kaydet" penceresi açılır ve baytlar ham ikili IPC ile Rust'a gönderilir
 * (uzantı + dosya imzası doğrulanır, atomik yazılır); tarayıcıda normal indirme kullanılır. Pencere iptal edilirse saved=false döner.
 */
export async function saveExport(blob: Blob, fileName: string, filterName: string): Promise<SaveResult> {
  if (!isTauri()) { downloadFile(blob, fileName); return { saved: true, where: fileName }; }
  const ext = fileName.split('.').pop() ?? '';
  const chosen = await save({ title: 'Kaydet', defaultPath: fileName, filters: [{ name: filterName, extensions: [ext] }] });
  if (!chosen) return { saved: false, where: '' };
  const path = chosen.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? chosen : `${chosen}.${ext}`;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const where = await invoke<string>('save_export_file', bytes, { headers: { 'x-export-path': encodeURIComponent(path) } });
  return { saved: true, where };
}
