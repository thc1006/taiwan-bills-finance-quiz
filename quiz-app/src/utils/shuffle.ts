/**
 * Fisher–Yates 洗牌。
 *
 * 只洗「題目順序」，**不洗選項順序**。選項的 key（A/B/C/D）由來源檔的欄位位置
 * 決定，而解析文字經常直接寫「(3) 才是正確的」；執行期打亂選項會讓畫面
 * 與解析互相矛盾。
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** 隨機取 n 個（n 大於總數時回傳全部）。 */
export function sample<T>(items: readonly T[], n: number): T[] {
  return shuffle(items).slice(0, Math.max(0, Math.min(n, items.length)));
}
