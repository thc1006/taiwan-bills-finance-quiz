/**
 * 文件數字閘門。
 *
 * README 裡寫的每一個統計數字，都是從資料集抄過去的一份副本 ——
 * 而副本會漂。本專案的測試數字已經漂過兩次（93 → 103 → 實際 112），
 * 兩次都是「加了東西但忘了回頭改文件」。
 *
 * 手動改第三次只會保證第四次再漂，所以改成讓 CI 擋：
 * README 宣稱的數字若與資料集或實際測試數不符，這支測試就失敗。
 *
 * 這也是本專案誠實性原則的延伸 —— 一份寫著錯誤統計的 README，
 * 和一個叫「已查證」但沒查證的欄位是同一種病。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allQuestions, meta, stats } from './questions';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SRC_ROOT = join(__dirname, '..');
const README = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');

/** 取出 README 中符合 pattern 的第一個數字（允許千分位逗號） */
function claimed(pattern: RegExp): number | null {
  const m = README.match(pattern);
  if (!m || !m[1]) return null;
  return Number(m[1].replace(/,/g, ''));
}

/** 遞迴數出所有測試檔中宣告的測試案例數 */
function countTestCases(dir: string): number {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      n += countTestCases(p);
    } else if (/\.test\.tsx?$/.test(entry)) {
      // 只數頂層的 it( / test( 宣告；本專案沒有動態產生測試，
      // 所以這個數字與 vitest 實際跑的案例數一致。
      n += (readFileSync(p, 'utf8').match(/^\s*(?:it|test)\(/gm) ?? []).length;
    }
  }
  return n;
}

describe('README 的題庫統計必須與資料集相符', () => {
  it('總題數', () => {
    expect(claimed(/去重後總計\s+([\d,]+) 題/)).toBe(stats.total);
  });

  it('分科題數', () => {
    expect(claimed(/票券金融法規\s+([\d,]+) 題/)).toBe(stats.bySubject['票券金融法規']);
    expect(claimed(/票券金融實務\s+([\d,]+) 題/)).toBe(stats.bySubject['票券金融實務']);
  });

  it('來源組成', () => {
    expect(claimed(/官方公會參考題庫\s+([\d,]+) 題/)).toBe(stats.official);
    expect(claimed(/其中與官方重複\s+([\d,]+) 題/)).toBe(meta.deduped_against_official);
  });

  it('附解析與附法條題數', () => {
    expect(claimed(/附解析\s+([\d,]+) 題/)).toBe(stats.withExplanation);
    expect(claimed(/附現行法條原文\s+([\d,]+) 題/)).toBe(stats.withLawText);
  });

  it('標籤題數', () => {
    expect(claimed(/計算題\s+([\d,]+) 題/)).toBe(stats.calculation);
    expect(claimed(/來源標為「易錯題」\s+([\d,]+) 題/)).toBe(
      allQuestions.filter((q) => q.tags.includes('易錯題')).length
    );
  });

  it('答案衝突題數', () => {
    expect(claimed(/兩份來源答案互相矛盾\s+([\d,]+) 題/)).toBe(meta.answer_conflicts.count);
  });

  it('法規語料庫規模', () => {
    expect(claimed(/以 (\d+) 部票券法規/)).toBe(meta.law_citation_audit.corpus.laws);
    expect(claimed(/以 \d+ 部票券法規（([\d,]+) 條）/)).toBe(
      meta.law_citation_audit.corpus.articles
    );
  });

  it('稽核解析覆蓋率', () => {
    const cov = meta.law_citation_audit.parser_coverage;
    expect(claimed(/解析中含「第 N 條」字樣的題共 ([\d,]+) 題/)).toBe(
      cov.explanations_containing_article_ref
    );
    expect(claimed(/工具成功解析 ([\d,]+) 題/)).toBe(cov.successfully_parsed);
  });
});

describe('README 宣稱的測試數必須與實際相符', () => {
  it('測試案例數', () => {
    const actual = countTestCases(SRC_ROOT);
    const inScript = claimed(/npm run test:run\s+#\s*([\d,]+) 個單元測試/);
    const inSection = claimed(/([\d,]+) 個測試分/);
    expect(inScript).toBe(actual);
    expect(inSection).toBe(actual);
  });

  /** 這支測試自己也要被數進去，所以順便確認它真的掃到了本檔案 */
  it('掃描範圍涵蓋所有測試檔', () => {
    expect(countTestCases(SRC_ROOT)).toBeGreaterThan(100);
  });
});
