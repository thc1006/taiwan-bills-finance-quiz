import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // 自訂 exclude 會「取代」而非 merge vitest 預設值，
      // 所以 config / 型別宣告 / 資料檔都必須明列，否則會被算進分母拉低覆蓋率。
      exclude: [
        'node_modules/',
        'dist/',
        'coverage/',
        '**/*.config.{js,ts,mjs,cjs}',
        '**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/main.tsx',
        'src/types/**',
        'src/data/*.json',
        '**/*.d.ts',
      ],
    },
  },
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
});
