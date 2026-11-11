// 測試設定（Vitest）。和網頁打包設定分開，測試從整個 repo 找檔案。

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['games/**/tests/**/*.test.ts', 'server/tests/**/*.test.ts'],
  },
});
