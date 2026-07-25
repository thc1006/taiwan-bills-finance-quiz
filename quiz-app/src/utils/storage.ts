/**
 * localStorage 薄封裝。
 *
 * 直接呼叫 localStorage 會在兩種真實情境下丟例外並炸掉整個 render：
 *   - Safari 無痕模式（setItem 直接 throw QuotaExceededError）
 *   - 使用者關閉第三方儲存 / 企業政策封鎖
 * 備考工具沒必要因為存不了「錯題紀錄」就整頁白畫面，所以一律吞掉例外並降級。
 */
const PREFIX = 'bfq:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* 忽略 */
  }
}
