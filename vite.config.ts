// 網頁打包設定（Vite）。網頁原始碼在 web/，打包結果放到 web/dist/。

import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
