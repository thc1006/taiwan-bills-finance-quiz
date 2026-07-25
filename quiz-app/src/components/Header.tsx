import type { AccessibilitySettings } from '../types/quiz';

export interface HeaderProps {
  settings: AccessibilitySettings;
  onCycleTheme: () => void;
  onFontSize: (v: AccessibilitySettings['fontSize']) => void;
  onToggleContrast: () => void;
  onHome: () => void;
  showHome: boolean;
}

const THEME_LABEL: Record<AccessibilitySettings['theme'], string> = {
  system: '🖥 跟隨系統',
  light: '☀ 淺色',
  dark: '☾ 深色',
};

export function Header({
  settings,
  onCycleTheme,
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
        <button
          type="button"
          onClick={onCycleTheme}
          className="btn-ghost"
          aria-label={`主題：${THEME_LABEL[settings.theme]}，點擊切換`}
        >
          {THEME_LABEL[settings.theme]}
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
