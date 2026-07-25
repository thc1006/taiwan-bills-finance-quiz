import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// GitHub Pages 部署設定。
// base 必須與 repo 名稱一致，否則 Pages 上所有資產路徑都會 404。
export default defineConfig({
  plugins: [react()],
  base: '/taiwan-bills-finance-quiz/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@data': resolve(__dirname, 'src/data'),
      '@hooks': resolve(__dirname, 'src/hooks'),
      '@types': resolve(__dirname, 'src/types'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // dataset.json 約 1.4 MB（1,237 題 + 320 題的現行法條原文）。
    // 它是應用的核心資料，拆 chunk 也還是要下載，故直接放寬門檻而非假裝它變小了。
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
        },
      },
    },
  },
});
