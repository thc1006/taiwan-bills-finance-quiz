import { describe, expect, it } from 'vitest';
import { allQuestions, allTags, dataset, meta, sources, stats } from './questions';
import { fingerprint } from '../utils/question-identity';
import { EXAM_SUBJECTS } from '../types/quiz';

const VALID_KEYS = new Set(['A', 'B', 'C', 'D']);
const VALID_CITATION_STATUS = new Set([
  'verified_article_exists',
  'article_not_found',
  'indeterminate',
  'law_outside_corpus',
  'cited_document_not_in_corpus',
  'no_citation',
]);

describe('dataset 結構完整性', () => {
  it('有題目', () => {
    expect(allQuestions.length).toBeGreaterThan(1000);
  });

  it('每題的答案都是 A~D', () => {
    const bad = allQuestions.filter((q) => !VALID_KEYS.has(q.answer));
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  /**
   * 答案必須真的對應到一個存在的選項。
   * 若來源檔的答案是 3、但該題只有兩個選項，這題永遠不可能答對 ——
   * 使用者會以為是自己錯了。
   */
  it('每題的答案都對應到實際存在的選項', () => {
    const bad = allQuestions.filter(
      (q) => !q.options.some((o) => o.key === q.answer)
    );
    expect(bad.map((q) => `${q.id}:${q.answer}`)).toEqual([]);
  });

  it('每題至少 2 個選項，最多 4 個', () => {
    const bad = allQuestions.filter((q) => q.options.length < 2 || q.options.length > 4);
    expect(bad.map((q) => `${q.id}:${q.options.length}`)).toEqual([]);
  });

  it('選項 key 不重複且皆為 A~D', () => {
    const bad = allQuestions.filter((q) => {
      const keys = q.options.map((o) => o.key);
      return new Set(keys).size !== keys.length || keys.some((k) => !VALID_KEYS.has(k));
    });
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  it('題幹與選項文字皆非空白', () => {
    const bad = allQuestions.filter(
      (q) => q.stem.trim() === '' || q.options.some((o) => o.text.trim() === '')
    );
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  it('科目只能是官方的兩科', () => {
    const bad = allQuestions.filter((q) => !EXAM_SUBJECTS.includes(q.subject));
    expect(bad.map((q) => `${q.id}:${q.subject}`)).toEqual([]);
  });

  it('id 唯一', () => {
    const ids = allQuestions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * 同科內不得有重複題。
   *
   * 這支測試同時驗證 TS 端的 fingerprint 與 Python 端 norm_text 判定一致 ——
   * 兩邊定義若漂移，這裡會先炸，而不是讓使用者在考卷上看到重複題。
   */
  it('同一科目內題幹指紋無重複', () => {
    const dups: string[] = [];
    for (const subject of EXAM_SUBJECTS) {
      const seen = new Map<string, string>();
      for (const q of allQuestions.filter((x) => x.subject === subject)) {
        const fp = fingerprint(q.stem);
        const prev = seen.get(fp);
        if (prev) dups.push(`[${subject}] ${prev} ↔ ${q.id}`);
        else seen.set(fp, q.id);
      }
    }
    expect(dups).toEqual([]);
  });

  /**
   * 跨科重複是**來源資料的既有事實**，不是 bug：
   * 官方公會題庫的法規 #174 與實務 #416 就是同一題（選項一個寫 0.15、一個寫 15%）。
   *
   * 資料層必須兩份都留 —— 只練一科的人不該因為去重而少一題。
   * 去重的責任在抽題層（getPool / buildPaper），由 useQuiz.test.ts 驗證。
   * 這支測試只把「目前有幾組跨科重複」釘住：數字變了就得有人來看一眼，
   * 確認是新來源帶進來的，而不是誰把去重邏輯改壞了。
   */
  it('跨科重複組數維持已知值（變動時需人工覆核）', () => {
    const bySubject = new Map<string, Set<string>>();
    for (const subject of EXAM_SUBJECTS) {
      bySubject.set(
        subject,
        new Set(
          allQuestions.filter((q) => q.subject === subject).map((q) => fingerprint(q.stem))
        )
      );
    }
    const [a, b] = EXAM_SUBJECTS;
    const setA = bySubject.get(a!)!;
    const setB = bySubject.get(b!)!;
    const cross = [...setA].filter((fp) => setB.has(fp));
    expect(cross).toHaveLength(1);
  });
});

describe('provenance 與稽核欄位', () => {
  it('每題都標明來源類型', () => {
    const bad = allQuestions.filter(
      (q) =>
        q.provenance.source_type !== 'official_association_bank' &&
        q.provenance.source_type !== 'community_compilation'
    );
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  it('每題的 source_id 都能在 sources 清單中找到', () => {
    const known = new Set(sources.map((s) => s.source_id));
    const bad = allQuestions.filter((q) => !known.has(q.source_id));
    expect(bad.map((q) => `${q.id}:${q.source_id}`)).toEqual([]);
  });

  it('law_citation.status 為已知值', () => {
    const bad = allQuestions.filter((q) => !VALID_CITATION_STATUS.has(q.law_citation.status));
    expect(bad.map((q) => `${q.id}:${q.law_citation.status}`)).toEqual([]);
  });

  /**
   * 現行條文原文只能掛在「已確認該條存在」的題上。
   * 掛在其他狀態上等於用一段可能不相干的條文誤導使用者。
   */
  it('current_text 只出現在 verified_article_exists 的題目上', () => {
    const bad = allQuestions.filter(
      (q) => q.law_citation.current_text && q.law_citation.status !== 'verified_article_exists'
    );
    expect(bad.map((q) => q.id)).toEqual([]);
  });

  it('verified_article_exists 的題必定帶有法規名稱、條號與條文原文', () => {
    const bad = allQuestions.filter(
      (q) =>
        q.law_citation.status === 'verified_article_exists' &&
        (!q.law_citation.law || !q.law_citation.article || !q.law_citation.current_text)
    );
    expect(bad.map((q) => q.id)).toEqual([]);
  });
});

describe('meta 統計與實際資料一致', () => {
  it('total_questions 與實際題數相符', () => {
    expect(meta.total_questions).toBe(allQuestions.length);
  });

  it('by_subject 與實際分布相符', () => {
    for (const s of EXAM_SUBJECTS) {
      expect(meta.by_subject[s]).toBe(stats.bySubject[s]);
    }
  });

  it('by_source_type 與實際分布相符', () => {
    expect(meta.by_source_type['official_association_bank']).toBe(stats.official);
    expect(meta.by_source_type['community_compilation']).toBe(stats.community);
  });

  it('with_explanation 與實際相符', () => {
    expect(meta.with_explanation).toBe(stats.withExplanation);
  });

  it('law_citation_audit 的計數總和等於題數', () => {
    const sum = Object.values(meta.law_citation_audit.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(allQuestions.length);
  });

  it('law_citation_audit 各狀態計數與逐題統計相符', () => {
    for (const [status, n] of Object.entries(meta.law_citation_audit.counts)) {
      const actual = allQuestions.filter((q) => q.law_citation.status === status).length;
      expect(`${status}=${actual}`).toBe(`${status}=${n}`);
    }
  });

  it('exam 規格與官方簡章一致（兩科各 50 題 / 60 分鐘 / 滿分 100）', () => {
    expect(meta.exam.subjects).toHaveLength(2);
    for (const s of meta.exam.subjects) {
      expect(s.questions).toBe(50);
      expect(s.minutes).toBe(60);
      expect(s.full_marks).toBe(100);
    }
    expect(meta.exam.fee_twd).toBe(1130);
  });
});

describe('標籤', () => {
  it('allTags 涵蓋題庫中出現的所有標籤', () => {
    const actual = new Set(allQuestions.flatMap((q) => q.tags));
    expect(new Set(allTags)).toEqual(actual);
  });

  it('計算題標籤有實際題目', () => {
    expect(stats.calculation).toBeGreaterThan(0);
  });
});

describe('dataset 匯出物', () => {
  it('items 即為 allQuestions', () => {
    expect(dataset.items).toBe(allQuestions);
  });
});
