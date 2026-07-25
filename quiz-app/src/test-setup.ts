import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // 每個測試之間清掉 localStorage —— 錯題本是跨測試的全域狀態，
  // 不清會讓「錯題複習」相關測試互相污染（測試順序一變就爆）。
  try {
    localStorage.clear();
  } catch {
    /* jsdom 一定有，保險起見 */
  }
});
