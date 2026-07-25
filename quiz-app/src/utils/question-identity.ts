import type { QuizOption } from '../types/quiz';

/**
 * 題目同一性判定。
 *
 * 這裡的 fingerprint 必須與 tools/build_dataset.py 的同名函式**完全同義**。
 * 兩邊若不一致，資料管線擋掉的重複題，執行期抽題時照樣會在同一份考卷上出現兩次
 * —— 而使用者只會覺得「這題剛剛不是考過了嗎」。
 *
 * ── 為什麼指紋必須包含選項 ──────────────────────────────
 * 第一版只比題幹。那是錯的：本題庫裡「下列何者為非：」這種通用題幹是**共用的**，
 * 不同的題目會用同一句開頭。只比題幹會把兩題完全不同的題判為重複，
 * 然後靜默刪掉其中一題 —— 實測有 23 題因此從題庫消失
 * （國庫券發行、短期票券設質、轉投資規定、商業本票…）。
 *
 * 選項用**集合**比對而非序列：兩份來源可能以不同順序列出相同選項，那仍是同一題。
 */

const PUNCT_RE = /[，。？?、：:；;（）()「」『』【】[\]，、,‐-―\-_/\\~｜|]/g;

/**
 * 文字正規化。
 *
 * 注意**不剝小數點** —— 剝掉會讓 `0.05` 變成 `005`，
 * 下面的數值折疊就再也認不出它其實是 `5%`。
 */
export function normText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(PUNCT_RE, '')
    .replace(/臺/g, '台');
}

const CN_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function cnNum(w: string): number | null {
  if (!w || [...w].some((c) => !(c in CN_DIGITS))) return null;
  if (w.startsWith('十')) return 10 + (w.length > 1 ? (CN_DIGITS[w[1]!] ?? 0) : 0);
  const i = w.indexOf('十');
  if (i > 0) {
    const tens = CN_DIGITS[w[0]!] ?? 0;
    const ones = w.slice(i + 1);
    return tens * 10 + (ones ? (CN_DIGITS[ones] ?? 0) : 0);
  }
  return w.length === 1 ? (CN_DIGITS[w] ?? null) : null;
}

/**
 * 數值的正規表示。
 *
 * 不能用 `String(Number(v.toPrecision(6)))` 或 Python 的 `%g` —— 後者對
 * 4.99e7 這種量級會切換成科學記號而前者不會，兩端指紋就此分裂
 * （實測 1,260 題中有 7 題不一致，全是金額類的計算題）。
 * 固定 6 位小數再去尾零，這個格式在 JS 與 Python 的定義完全一致。
 */
function g(v: number): string {
  return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * 選項正規化，額外折疊數值記法。
 *
 * 來源檔對同一個數值有三種寫法：`5%`、`0.05`、`百分之五`。
 * 不折疊的話，同一題會因為選項寫法不同而被判為兩題不同的題目，
 * 兩題都留在題庫裡，使用者就會連續看到兩次「一樣」的題。
 */
export function normOption(s: string): string {
  const t = normText(s);
  let m = /^百分之([一二三四五六七八九十零]+)$/.exec(t);
  if (m) {
    const v = cnNum(m[1]!);
    if (v !== null) return `#${g(v / 100)}`;
  }
  m = /^百分之([0-9.]+)$/.exec(t);
  if (m) return `#${g(Number(m[1]) / 100)}`;
  m = /^([0-9.]+)%$/.exec(t);
  if (m) return `#${g(Number(m[1]) / 100)}`;
  m = /^([0-9.]+)$/.exec(t);
  if (m) return `#${g(Number(m[1]))}`;
  return t;
}

export interface Identifiable {
  stem: string;
  options: QuizOption[];
}

/** 題目指紋 = 題幹 ＋ 選項集合（順序無關） */
export function fingerprint(q: Identifiable): string {
  const opts = q.options.map((o) => normOption(o.text)).sort();
  return normText(q.stem) + '||' + opts.join('|');
}

/** 依內容（而非 id）去重，保留第一次出現者。 */
export function dedupeByContent<T extends Identifiable>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const fp = fingerprint(item);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(item);
  }
  return out;
}
