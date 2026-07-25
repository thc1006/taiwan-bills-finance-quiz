// 題庫與測驗的型別定義
// 對應 src/data/dataset.json（由 tools/build_dataset.py + tools/check_law_citations.py 產生）

/** 選項。key 由來源檔的欄位位置決定（選項1 恆為 A），不隨顯示順序改變。 */
export interface QuizOption {
  key: 'A' | 'B' | 'C' | 'D';
  text: string;
}

/** 考試科目 —— 與官方簡章的節次名稱一致 */
export type ExamSubject = '票券金融法規' | '票券金融實務';

export const EXAM_SUBJECTS: readonly ExamSubject[] = ['票券金融法規', '票券金融實務'];

/**
 * 題目來源類型。
 *
 * official_association_bank —— 票券公會公開釋出的參考題庫（480 題）。
 * community_compilation    —— 不具名考生社群整理的考古題彙編。來源檔首列自述
 *                             「有 1~2 題正解或選項描述有錯誤」，可信度低於前者。
 *
 * 這個欄位會渲染成徽章。**使用者有權知道每一題的答案是誰說的。**
 */
export type SourceType = 'official_association_bank' | 'community_compilation';

/**
 * 引用法條的稽核結果。
 *
 * 重要：`verified_article_exists` 只代表「解析引用的條號在現行條文中還存在」，
 * **不代表這題的答案是對的**。把它讀成答案已查證，是對這個欄位最常見的誤用。
 */
export type LawCitationStatus =
  | 'verified_article_exists'
  /** 該文件現行版無條號編制，改以「解析引述的內容仍在現行文件中」查證 */
  | 'verified_content_match'
  /** 同上，但引述的內容在現行文件中找不到 —— 該規定可能已刪除 */
  | 'content_not_found'
  | 'article_not_found'
  | 'indeterminate'
  | 'law_outside_corpus'
  | 'cited_document_not_in_corpus'
  | 'no_citation';

export interface LawCitation {
  status: LawCitationStatus;
  law?: string;
  article?: string;
  /** 現行條文原文（節錄）。只有 verified_article_exists 才有。 */
  current_text?: string;
  source_url?: string;
  /** 來源檔寫的原始法規名稱（模糊比對時保留，供人工覆核） */
  raw_law_name?: string;
  matched_via?: 'fuzzy' | 'suffix';
  reason?: string;
  /** verified_content_match 時，實際在現行文件中找到的片段 */
  matched_text?: string;
  note?: string;
}

/**
 * 兩份來源對同一題給出不同答案。
 *
 * 這是「其中一方是錯的」的直接證據，也是全題庫中最不該照單全收的一批題。
 * 本專案**不裁決誰對** —— 裁決需要查證，而我們沒有做查證。
 * 介面上會同時顯示兩方答案，讓使用者自行查現行法條。
 */
export interface AnswerConflict {
  /** 資料集實際採用的答案 */
  kept: 'A' | 'B' | 'C' | 'D';
  kept_source: SourceType;
  /** 另一份來源給的答案 */
  other: 'A' | 'B' | 'C' | 'D';
  other_source: SourceType;
}

export interface Provenance {
  source_type: SourceType;
  original_no?: number | null;
  sheet?: string;
  explanation_from?: string;
  also_in_community_compilation?: boolean;
  answer_conflict?: AnswerConflict;
}

/** 單一題目 */
export interface QuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  subject: ExamSubject;
  source_id: string;
  provenance: Provenance;
  tags: string[];
  law_citation: LawCitation;
}

export interface DatasetSource {
  source_id: string;
  title: string;
  url: string;
  publisher: string;
  authority: 'official' | 'community';
  accessed_at: string;
  note: string;
}

export interface ExamSubjectSpec {
  name: ExamSubject;
  questions: number;
  minutes: number;
  full_marks: number;
}

export interface DatasetMeta {
  title: string;
  generated_at: string;
  schema_version: string;
  exam: {
    name: string;
    commissioner: string;
    administrator: string;
    legal_basis: string;
    subjects: ExamSubjectSpec[];
    passing_rule: string;
    fee_twd: number;
    brochure_version: string;
    brochure_source_id: string;
  };
  total_questions: number;
  by_subject: Record<string, number>;
  by_source_type: Record<string, number>;
  with_explanation: number;
  deduped_against_official: number;
  answer_conflicts: {
    count: number;
    note: string;
  };
  answer_verification: {
    verified_against_official_key: number;
    note: string;
  };
  law_citation_audit: {
    checked_at: string;
    corpus: { source: string; laws: number; articles: number; retrieved_at: string };
    counts: Record<string, number>;
    corpus_gap_warnings: Record<string, number[]>;
    parser_coverage: {
      explanations_containing_article_ref: number;
      successfully_parsed: number;
      note: string;
    };
    what_this_means: string;
  };
}

export interface QuizDataset {
  meta: DatasetMeta;
  sources: DatasetSource[];
  items: QuizQuestion[];
}

/**
 * 測驗模式。
 *
 * practice —— 自選科目與題數，作答後立即顯示答案與現行法條。
 * mock     —— 依官方簡章的真實結構出卷：兩科各 50 題，套用真實及格規則
 *             （總分 ≥140 且任一科 ≥60）。作答中不顯示答案。
 * wrong    —— 只出先前做錯的題。
 */
export type QuizMode = 'practice' | 'mock' | 'wrong';

export interface QuizConfig {
  mode: QuizMode;
  /** practice / wrong 模式適用；mock 模式固定兩科各半，此欄位忽略 */
  subject: ExamSubject | 'all';
  questionCount: number;
  /** 只出含指定標籤的題（例如「計算題」）。空陣列 = 不限。 */
  tags: string[];
  /** 只出官方公會題庫的題 */
  officialOnly: boolean;
  showAnswerImmediately: boolean;
}

export interface AnswerRecord {
  questionId: string;
  subject: ExamSubject;
  selected: 'A' | 'B' | 'C' | 'D' | null;
  correct: 'A' | 'B' | 'C' | 'D';
  isCorrect: boolean;
  timeSpent: number;
}

/** 單科成績 —— mock 模式依此套用真實及格規則 */
export interface SubjectScore {
  subject: ExamSubject;
  answered: number;
  correct: number;
  total: number;
  /** 換算為滿分 100 的分數（四捨五入至整數，與電腦應試一致） */
  score: number;
}

export interface QuizResult {
  config: QuizConfig;
  startedAt: number;
  finishedAt: number;
  totalTime: number;
  answers: AnswerRecord[];
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  /** 全體正確率（%），與官方計分無關，僅供練習參考 */
  accuracy: number;
  subjectScores: SubjectScore[];
  /** 僅 mock 模式有意義：是否依官方規則及格 */
  passed: boolean | null;
  /** 未達標的原因（未及格時填入），例如「票券金融實務 52 分（未達 60）」 */
  failReasons: string[];
}

export interface AccessibilitySettings {
  theme: 'system' | 'light' | 'dark';
  fontSize: 'normal' | 'large' | 'xlarge';
  highContrast: boolean;
}
