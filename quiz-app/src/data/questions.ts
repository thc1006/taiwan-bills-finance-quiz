// 題庫資料模組
//
// dataset.json 由 tools/build_dataset.py 產生、tools/check_law_citations.py 加註
// 法條稽核欄位。**不要手改 dataset.json** —— 改了會在下次跑管線時被覆蓋，
// 而且 dataset-integrity.test.ts 的統計斷言會失敗。

import type {
  ExamSubject,
  QuizDataset,
  QuizQuestion,
} from '../types/quiz';
import rawDataset from './dataset.json';
import { dedupeByContent } from '../utils/question-identity';
import { sample } from '../utils/shuffle';

export const dataset = rawDataset as unknown as QuizDataset;

/** 全部題目（已於資料管線去重，此處不再重複去重） */
export const allQuestions: QuizQuestion[] = dataset.items;

export const meta = dataset.meta;
export const sources = dataset.sources;

export function getBySubject(subject: ExamSubject | 'all'): QuizQuestion[] {
  if (subject === 'all') return allQuestions;
  return allQuestions.filter((q) => q.subject === subject);
}

export interface PoolFilter {
  subject: ExamSubject | 'all';
  tags?: string[];
  officialOnly?: boolean;
}

/** 依條件取出候選題池（不抽樣、不洗牌） */
export function getPool({ subject, tags, officialOnly }: PoolFilter): QuizQuestion[] {
  let pool = getBySubject(subject);
  if (officialOnly) {
    pool = pool.filter((q) => q.provenance.source_type === 'official_association_bank');
  }
  if (tags && tags.length > 0) {
    pool = pool.filter((q) => tags.every((t) => q.tags.includes(t)));
  }
  // 防禦性：資料管線已去重，但若日後有人手動塞題進 dataset.json，
  // 這一層可避免同一份考卷出現兩次同題。
  return dedupeByContent(pool);
}

/** 依條件隨機抽 count 題 */
export function drawQuestions(filter: PoolFilter, count: number): QuizQuestion[] {
  return sample(getPool(filter), count);
}

/** 依 id 取題（錯題複習用） */
const byId = new Map(allQuestions.map((q) => [q.id, q]));
export function getById(id: string): QuizQuestion | undefined {
  return byId.get(id);
}

/** 統計 */
export const stats = {
  total: allQuestions.length,
  bySubject: Object.fromEntries(
    (['票券金融法規', '票券金融實務'] as ExamSubject[]).map((s) => [
      s,
      allQuestions.filter((q) => q.subject === s).length,
    ])
  ) as Record<ExamSubject, number>,
  official: allQuestions.filter(
    (q) => q.provenance.source_type === 'official_association_bank'
  ).length,
  community: allQuestions.filter(
    (q) => q.provenance.source_type === 'community_compilation'
  ).length,
  withExplanation: allQuestions.filter((q) => q.explanation.length > 0).length,
  withLawText: allQuestions.filter((q) => q.law_citation.current_text).length,
  calculation: allQuestions.filter((q) => q.tags.includes('計算題')).length,
};

/** 題庫中實際出現過的所有標籤 */
export const allTags: string[] = [
  ...new Set(allQuestions.flatMap((q) => q.tags)),
].sort();
