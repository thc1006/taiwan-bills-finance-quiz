/**
 * Python ↔ TypeScript 指紋一致性閘門。
 *
 * 題目指紋有兩份實作：
 *   tools/build_dataset.py 的 fingerprint()   —— 建置期用來去重
 *   src/utils/question-identity.ts 的 fingerprint() —— 執行期抽題用來去重
 *
 * 兩者必須逐字元同義。光靠註解叮嚀守不住 —— 實測它們已經分裂過兩次：
 *   1. 連字號字元集：TS 蓋 U+2010–U+2015，Python 只列了 - — –
 *   2. 數值格式：Python 的 %g 對 4.99e7 切換成科學記號，JS 的等價寫法不會
 *      （1,260 題中有 7 題不一致，全是金額類計算題）
 *
 * 兩次都是「看起來一樣、實際不一樣」。定義漂移的後果不是報錯，
 * 而是**使用者的考卷上出現重複題**，或**真題目被靜默刪掉** —— 兩者都不會有人回報。
 *
 * fixture 由 build_dataset.py 產生，逐題記錄 Python 端算出的指紋。
 */
import { describe, expect, it } from 'vitest';
import fixture from '../data/__fixtures__/fingerprints.json';
import { allQuestions } from '../data/questions';
import { fingerprint, normOption, normText } from './question-identity';

const pyFingerprints = fixture.fingerprints as string[];

describe('指紋實作必須與資料管線一致', () => {
  it('fixture 與題庫題數相符', () => {
    expect(pyFingerprints).toHaveLength(allQuestions.length);
  });

  it('每一題的 TS 指紋都等於 Python 指紋', () => {
    const mismatches: string[] = [];
    allQuestions.forEach((q, i) => {
      const ts = fingerprint(q);
      if (ts !== pyFingerprints[i]) {
        mismatches.push(`[${q.id}]\n  TS: ${ts}\n  PY: ${pyFingerprints[i]}`);
      }
    });
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  /**
   * 唯一性只在**同一科內**成立。
   *
   * 跨科重複是來源既有事實（官方題庫的法規 #174 與實務 #416 是同一題，
   * 選項一個寫 0.15、一個寫 15%，數值折疊後指紋相同），資料層刻意兩份都留 ——
   * 只練一科的人不該因為去重而少一題。跨科去重的責任在抽題層。
   */
  it('指紋在同一科內唯一', () => {
    const dups: string[] = [];
    for (const subject of ['票券金融法規', '票券金融實務']) {
      const seen = new Map<string, string>();
      allQuestions.forEach((q, i) => {
        if (q.subject !== subject) return;
        const fp = pyFingerprints[i]!;
        const prev = seen.get(fp);
        if (prev) dups.push(`[${subject}] ${prev} ↔ ${q.id}`);
        else seen.set(fp, q.id);
      });
    }
    expect(dups).toEqual([]);
  });
});

describe('normText', () => {
  it('忽略半形與全形空白', () => {
    expect(normText('下列 何者　正確？')).toBe(normText('下列何者正確'));
  });

  it('忽略中英文標點', () => {
    expect(normText('票券商，得經營下列業務：')).toBe(normText('票券商得經營下列業務'));
  });

  /** 來源檔混用 U+2010~U+2015 各種連字號，不歸一會導致同題被當成兩題。 */
  it('各式連字號視為相同', () => {
    expect(normText('RP‐交易')).toBe(normText('RP-交易'));
    expect(normText('RP—交易')).toBe(normText('RP-交易'));
  });

  it('臺／台 視為相同、全形英數經 NFKC 正規化', () => {
    expect(normText('臺灣貨幣市場')).toBe(normText('台灣貨幣市場'));
    expect(normText('ＲＰ１')).toBe(normText('RP1'));
  });

  /** 小數點**不能**被剝掉，否則 0.05 會變成 005，數值折疊就失效。 */
  it('保留小數點', () => {
    expect(normText('0.05')).toBe('0.05');
  });

  it('不同題目不會撞指紋', () => {
    expect(normText('票券商得經營保證業務')).not.toBe(normText('票券商不得經營保證業務'));
  });
});

describe('normOption 的數值折疊', () => {
  it('5% ≡ 0.05 ≡ 百分之五', () => {
    expect(normOption('5%')).toBe(normOption('0.05'));
    expect(normOption('百分之五')).toBe(normOption('0.05'));
  });

  it('12% ≡ 百分之十二', () => {
    expect(normOption('12%')).toBe(normOption('百分之十二'));
  });

  it('大數不使用科學記號（Python %g 會，兩端就會分裂）', () => {
    expect(normOption('49901400')).toBe('#49901400');
    expect(normOption('50000000')).toBe('#50000000');
  });

  it('非純數值的選項原樣保留', () => {
    expect(normOption('以上皆是')).toBe('以上皆是');
    expect(normOption('1000萬')).toBe('1000萬');
  });

  it('不同數值不會折疊在一起', () => {
    expect(normOption('5%')).not.toBe(normOption('15%'));
  });
});

describe('fingerprint 包含選項', () => {
  const stem = '下列何者為非：';
  const a = { stem, options: [{ key: 'A' as const, text: '甲' }, { key: 'B' as const, text: '乙' }] };
  const b = { stem, options: [{ key: 'A' as const, text: '丙' }, { key: 'B' as const, text: '丁' }] };

  /**
   * 這是加入選項的**理由**：「下列何者為非：」這種通用題幹是共用的，
   * 只比題幹會把兩題完全不同的題判為重複，然後刪掉一題。
   */
  it('同題幹但選項不同 → 不同指紋', () => {
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('選項順序不同 → 相同指紋', () => {
    const reordered = {
      stem,
      options: [{ key: 'A' as const, text: '乙' }, { key: 'B' as const, text: '甲' }],
    };
    expect(fingerprint(a)).toBe(fingerprint(reordered));
  });
});
