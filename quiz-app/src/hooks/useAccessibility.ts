import { useCallback, useEffect, useState } from 'react';
import type { AccessibilitySettings } from '../types/quiz';
import { readJSON, writeJSON } from '../utils/storage';

const KEY = 'a11y';

const defaults: AccessibilitySettings = {
  theme: 'system',
  fontSize: 'normal',
  highContrast: false,
};

/**
 * 無障礙設定，套用到 <html> 的 data-* 屬性，由 CSS 接手。
 *
 * theme='system' 時**不設** data-theme，讓 prefers-color-scheme 決定 ——
 * 硬寫一個值會讓使用者的系統深色模式失效。
 */
export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() =>
    readJSON<AccessibilitySettings>(KEY, defaults)
  );

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.setAttribute('data-font-size', settings.fontSize);
    root.toggleAttribute('data-high-contrast', settings.highContrast);
    writeJSON(KEY, settings);
  }, [settings]);

  const update = useCallback(
    <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
    },
    []
  );

  /**
   * 目前實際生效的主題。
   *
   * settings.theme 可以是 'system'（使用者還沒表態），此時實際外觀由 OS 決定，
   * 所以按鈕要顯示什麼、要切換到哪一邊，都得看這個值而不是 settings.theme。
   */
  const [systemDark, setSystemDark] = useState(
    () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const effectiveTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  /**
   * 單純的開關，不是三態循環。
   *
   * 原本是 system → light → dark → system 的循環，而按鈕上寫的是**目前狀態**。
   * 那有三個問題：看不到有哪些選項、按下去會變成什麼無從預測、
   * 而且「🖥 跟隨系統」既像狀態又像動作，還是個一般人看不懂的術語。
   *
   * 現在按鈕永遠只做一件事：切到現在的反面。標籤寫的是**動作**，不是狀態。
   * 「跟隨系統」退回成單純的預設值 —— 使用者沒表態前跟著 OS 走，
   * 一旦點了就是明確選擇，不再需要出現在介面上。
   */
  const toggleTheme = useCallback(() => {
    setSettings((s) => ({
      ...s,
      theme:
        (s.theme === 'system' ? (systemDark ? 'dark' : 'light') : s.theme) === 'dark'
          ? 'light'
          : 'dark',
    }));
  }, [systemDark]);

  return { settings, effectiveTheme, update, toggleTheme };
}
