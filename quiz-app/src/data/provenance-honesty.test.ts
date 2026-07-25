/**
 * 誠實性守門測試。
 *
 * 這支測試不檢查功能，它檢查**我們有沒有宣稱自己沒做過的事**。
 *
 * 一個叫「已查證」但其實沒查證的欄位，比沒有這個欄位危險得多 ——
 * 它會讓下一個維護者（或下一個 AI）跳過查證，並讓使用者把社群整理的答案
 * 當成官方認證的答案來背。這些斷言存在的目的，就是讓「悄悄把話說大」
 * 這件事在 CI 就失敗。
 */
import { describe, expect, it } from 'vitest';
import { allQuestions, meta, sources } from './questions';

describe('不得宣稱未曾進行的答案查證', () => {
  it('meta 明確記載「與官方答案逐條核對的題數為 0」', () => {
    expect(meta.answer_verification.verified_against_official_key).toBe(0);
  });

  it('answer_verification.note 必須說明答案未經核對且可能過時', () => {
    const note = meta.answer_verification.note;
    expect(note).toContain('沒有任何一題');
    expect(note).toContain('過時');
  });

  /**
   * 題目層級不得出現任何自封的「已查證」旗標。
   * 若日後有人加了 `answer_verified: true` 這種欄位，這裡會擋下來，
   * 直到有人真的做了查證、並在此更新規則為止。
   */
  it('題目層級不得帶有自封的查證旗標', () => {
    const banned = ['answer_verified', 'verified', 'confidence', 'quality_score'];
    const offenders: string[] = [];
    for (const q of allQuestions) {
      for (const key of banned) {
        if (key in (q as unknown as Record<string, unknown>)) {
          offenders.push(`${q.id}.${key}`);
        }
        if (key in (q.provenance as unknown as Record<string, unknown>)) {
          offenders.push(`${q.id}.provenance.${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('法條稽核的語意不得被誇大', () => {
  it('what_this_means 必須明講「不代表答案正確」', () => {
    expect(meta.law_citation_audit.what_this_means).toContain('不代表');
  });

  it('必須揭露 parser 覆蓋率，讓「沒查到」與「沒有引用」分得開', () => {
    const cov = meta.law_citation_audit.parser_coverage;
    expect(cov.explanations_containing_article_ref).toBeGreaterThan(0);
    expect(cov.successfully_parsed).toBeGreaterThan(0);
    expect(cov.successfully_parsed).toBeLessThanOrEqual(
      cov.explanations_containing_article_ref
    );
  });

  /**
   * 語料庫抽取若有缺口，就不能用它去指控題目「引用的條文不存在」——
   * 那個結論很可能只是我們自己漏抓了條文標題（本專案第一版正是如此：
   * MOJ 的「本條文有附件 第 4 條」讓 10 條被漏掉、8 題被誤標為過時）。
   */
  it('有條號缺口的法規，不得產生 article_not_found 結論', () => {
    const gapped = new Set(Object.keys(meta.law_citation_audit.corpus_gap_warnings ?? {}));
    const wrongly = allQuestions.filter(
      (q) =>
        q.law_citation.status === 'article_not_found' &&
        q.law_citation.law !== undefined &&
        gapped.has(q.law_citation.law)
    );
    expect(wrongly.map((q) => q.id)).toEqual([]);
  });
});

describe('來源揭露', () => {
  it('每個來源都標明發布者與權威層級', () => {
    for (const s of sources) {
      expect(s.publisher.length).toBeGreaterThan(0);
      expect(['official', 'community']).toContain(s.authority);
      expect(s.url).toMatch(/^https?:\/\//);
    }
  });

  /**
   * 社群來源的 note 必須誠實說出它的已知缺陷。
   * 來源檔第一列自述「有 1~2 題正解或選項描述有錯誤」——
   * 這句話不能在轉載時被洗掉。
   */
  it('社群來源必須揭露其已知錯誤', () => {
    const community = sources.filter((s) => s.authority === 'community');
    expect(community.length).toBeGreaterThan(0);
    for (const s of community) {
      expect(s.note).toMatch(/錯誤|未經|不具名/);
    }
  });

  it('官方來源不得被標成 community，反之亦然', () => {
    const tbfa = sources.find((s) => s.source_id === 'tbfa-official-bank');
    expect(tbfa?.authority).toBe('official');
    const comm = sources.find((s) => s.source_id === 'community-compilation-940');
    expect(comm?.authority).toBe('community');
  });
});
