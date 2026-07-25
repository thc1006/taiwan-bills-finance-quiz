/**
 * 題目同一性判定。
 *
 * 這裡的 fingerprint 必須與 tools/build_dataset.py 的 norm_text() **完全同義**。
 * 兩邊若不一致，資料管線擋掉的重複題，執行期抽題時照樣會在同一份考卷上出現兩次
 * —— 而使用者只會覺得「這題剛剛不是考過了嗎」。
 *
 * 正規化步驟（順序有意義）：
 *   1. NFKC —— 全形英數／全形括號歸一
 *   2. 移除所有空白（含全形空白 U+3000，來源檔大量使用）
 *   3. 移除標點與各式連字號（U+2010–U+2015 都會出現在來源檔）
 *   4. 臺 → 台
 */
const PUNCT_RE =
  /[，。？?、：:；;（）()「」『』【】[\].,‐-―\-_/\\~｜|]/g;

export function fingerprint(stem: string): string {
  return stem
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(PUNCT_RE, '')
    .replace(/臺/g, '台');
}

/** 依內容（而非 id）去重，保留第一次出現者。 */
export function dedupeByContent<T extends { stem: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const fp = fingerprint(item.stem);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(item);
  }
  return out;
}
