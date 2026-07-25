import type { AccessibilitySettings } from '../types/quiz';

export interface HeaderProps {
  settings: AccessibilitySettings;
  /** 目前實際生效的主題（settings.theme 可能是 'system'） */
  effectiveTheme: 'light' | 'dark';
  onToggleTheme: () => void;
  onFontSize: (v: AccessibilitySettings['fontSize']) => void;
  onToggleContrast: () => void;
  onHome: () => void;
  showHome: boolean;
}

export function Header({
  settings,
  effectiveTheme,
  onToggleTheme,
  onFontSize,
  onToggleContrast,
  onHome,
  showHome,
}: HeaderProps) {
  return (
    <header className="site-header">
      <button type="button" className="brand" onClick={onHome}>
        票券商業務人員<span className="brand-sub">備考練習</span>
      </button>
      <div className="header-tools">
        {showHome && (
          <button type="button" onClick={onHome} className="btn-ghost">
            回首頁
          </button>
        )}
        {/* 標籤寫的是「按下去會發生什麼」，不是「現在是什麼」 */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="btn-ghost"
          aria-label={effectiveTheme === 'dark' ? '切換至淺色模式' : '切換至深色模式'}
        >
          {effectiveTheme === 'dark' ? '☀ 淺色' : '☾ 深色'}
        </button>
        <label className="sr-only" htmlFor="font-size">
          字級
        </label>
        <select
          id="font-size"
          value={settings.fontSize}
          onChange={(e) =>
            onFontSize(e.target.value as AccessibilitySettings['fontSize'])
          }
          className="btn-ghost"
        >
          <option value="normal">字級 標準</option>
          <option value="large">字級 大</option>
          <option value="xlarge">字級 特大</option>
        </select>
        <button
          type="button"
          onClick={onToggleContrast}
          className={`btn-ghost ${settings.highContrast ? 'on' : ''}`}
          aria-pressed={settings.highContrast}
        >
          高對比
        </button>
      </div>
    </header>
  );
}
