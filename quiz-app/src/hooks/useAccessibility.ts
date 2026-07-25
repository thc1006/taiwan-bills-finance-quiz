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

  const cycleTheme = useCallback(() => {
    setSettings((s) => ({
      ...s,
      theme: s.theme === 'system' ? 'light' : s.theme === 'light' ? 'dark' : 'system',
    }));
  }, []);

  return { settings, update, cycleTheme };
}
