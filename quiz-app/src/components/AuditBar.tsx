import { useId, useState } from 'react';

/**
 * 引用法條稽核的覆蓋率 —— 單一水平堆疊長條。
 *
 * 形態的選擇：這是 part-to-whole（1,237 題如何分布在四種稽核狀態），
 * 所以是堆疊長條而非四個獨立數字；類別名稱很長，因此走水平。
 *
 * 顏色的選擇：這四類**不是身分，是核對程度的序數**
 * （已核對通過 ＞ 引用他法未核對 ＞ 無可辨識引用），所以用單色階（藍，深→淺）
 * 而不是四個類別色。唯一的例外是「引用條號已不存在」——那是狀態告警，
 * 用 status critical 並固定配 icon 與文字標籤，不靠顏色單獨表意。
 *
 * 色階已通過 validate_palette.js 的序數檢查（淺色與深色各自驗過）：
 *   淺色 #184f95 / #3987e5 / #86b6ef（單色相、亮度單調、最淺端 2.11:1）
 *   深色 #b7d3f6 / #5598e7 / #256abf（最深端 3.20:1）
 */
export interface AuditSlice {
  key: string;
  label: string;
  value: number;
  /** 對應 CSS 變數名稱（不含 var()） */
  tone: 'v1' | 'v2' | 'v3' | 'critical';
  hint: string;
}

export function AuditBar({ slices, total }: { slices: AuditSlice[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();
  const shown = slices.filter((s) => s.value > 0);

  return (
    <figure className="audit" aria-labelledby={titleId}>
      <figcaption id={titleId} className="audit-cap">
        1,237 題的引用法條稽核分布
      </figcaption>

      <div
        className="audit-track"
        role="img"
        aria-label={shown
          .map((s) => `${s.label} ${s.value} 題，佔 ${Math.round((s.value / total) * 100)}%`)
          .join('；')}
      >
        {shown.map((s) => (
          <div
            key={s.key}
            className={`audit-seg tone-${s.tone} ${hover === s.key ? 'on' : ''}`}
            style={{ flexGrow: s.value }}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            // aria-hidden 且不可聚焦：色塊本身不帶語意，整條的內容由外層
            // role="img" 的 aria-label 一次講完，下方圖例又逐項列出數值。
            // 若這裡再放 tabIndex，鍵盤使用者要多按四次 Tab 才能離開一張圖，
            // 而且 aria-hidden 元素本來就不該進入焦點順序。
            aria-hidden
          >
            {hover === s.key && (
              <span className="audit-tip">
                {s.label} · {s.value} 題（{Math.round((s.value / total) * 100)}%）
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 四個類別都直接標示 —— 身分永遠不靠顏色單獨傳達 */}
      <ul className="audit-legend">
        {slices.map((s) => (
          <li key={s.key} title={s.hint}>
            <span className={`swatch tone-${s.tone}`} aria-hidden />
            <span className="audit-label">{s.label}</span>
            <b className="audit-value">{s.value}</b>
            <span className="audit-pct">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="link-btn"
        aria-expanded={showTable}
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? '收起數據表' : '以表格檢視'}
      </button>
      {showTable && (
        <table className="audit-table">
          <thead>
            <tr>
              <th scope="col">稽核狀態</th>
              <th scope="col">題數</th>
              <th scope="col">佔比</th>
              <th scope="col">意義</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s) => (
              <tr key={s.key}>
                <th scope="row">{s.label}</th>
                <td>{s.value}</td>
                <td>{Math.round((s.value / total) * 100)}%</td>
                <td className="audit-hint">{s.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}
