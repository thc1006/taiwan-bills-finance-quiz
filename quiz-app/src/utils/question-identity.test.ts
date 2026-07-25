import { describe, expect, it } from 'vitest';
import { dedupeByContent, fingerprint } from './question-identity';

describe('fingerprint', () => {
  it('忽略半形與全形空白', () => {
    expect(fingerprint('下列 何者　正確？')).toBe(fingerprint('下列何者正確'));
  });

  it('忽略中英文標點', () => {
    expect(fingerprint('票券商，得經營下列業務：')).toBe(
      fingerprint('票券商得經營下列業務')
    );
  });

  /** 來源檔混用 U+2010~U+2015 各種連字號，不歸一會導致同題被當成兩題。 */
  it('各式連字號視為相同', () => {
    expect(fingerprint('RP‐交易')).toBe(fingerprint('RP-交易'));
    expect(fingerprint('RP—交易')).toBe(fingerprint('RP-交易'));
  });

  it('臺／台 視為相同', () => {
    expect(fingerprint('臺灣貨幣市場')).toBe(fingerprint('台灣貨幣市場'));
  });

  it('全形英數經 NFKC 正規化', () => {
    expect(fingerprint('ＲＰ１')).toBe(fingerprint('RP1'));
  });

  it('不同題目不會撞指紋', () => {
    expect(fingerprint('票券商得經營保證業務')).not.toBe(
      fingerprint('票券商不得經營保證業務')
    );
  });
});

describe('dedupeByContent', () => {
  it('保留第一次出現者', () => {
    const items = [
      { id: 1, stem: '下列何者正確？' },
      { id: 2, stem: '下列 何者 正確' },
      { id: 3, stem: '另一題' },
    ];
    const out = dedupeByContent(items);
    expect(out.map((x) => x.id)).toEqual([1, 3]);
  });

  it('空陣列安全', () => {
    expect(dedupeByContent([])).toEqual([]);
  });
});
