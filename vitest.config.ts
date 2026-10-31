import { defineConfig } from 'vitest/config';

// Yedek klasörleri (backup_*) testlere karışmasın; sayılar gerçek kaynağı yansıtsın.
export default defineConfig({
  test: { exclude: ['backup_*/**', 'node_modules/**', 'dist/**', 'src-tauri/**', 'test-output/**'] },
});
