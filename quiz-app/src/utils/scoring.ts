/**
 * 計分 —— 依官方簡章（115.05.01）的真實規則。
 *
 *   節次 1  票券金融法規   50 題 滿分 100 分 60 分鐘
 *   節次 2  票券金融實務   50 題 滿分 100 分 60 分鐘
 *   合格：兩科總分合計達 140 分，且**任一科不得低於 60 分**
 *
 * 「總分 140」與「單科 60」是**兩個都要滿足**的條件。只看總分是最常見的誤解：
 * 法規 95 + 實務 55 = 150 分，看起來超過 140，實際上不合格。
 * 這支模組把兩個條件都算出來，並在未達標時明確指出是哪一項沒過。
 *
 * 未作答一律視為答錯（電腦應試不倒扣，但也不給分）。
 */
import type {
  AnswerRecord,
  ExamSubject,
  SubjectScore,
} from '../types/quiz';
import { EXAM_SUBJECTS } from '../types/quiz';

export const PASS_TOTAL = 140;
export const PASS_PER_SUBJECT = 60;

/**
 * 換算單科分數。
 *
 * 正式測驗每科固定 50 題、每題 2 分。練習時題數可能不是 50，
 * 因此按比例換算為滿分 100，並四捨五入至整數。
 * total 為 0 時回傳 0 —— 沒有作答任何一題就不該產生一個看起來合理的分數。
 */
export function scoreOf(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

export function computeSubjectScores(
  answers: readonly AnswerRecord[],
  /** 每科實際出了幾題（含未作答者）。未傳入時由 answers 推算。 */
  totalsBySubject?: Partial<Record<ExamSubject, number>>
): SubjectScore[] {
  return EXAM_SUBJECTS.map((subject) => {
    const rows = answers.filter((a) => a.subject === subject);
    const total = totalsBySubject?.[subject] ?? rows.length;
    const correct = rows.filter((a) => a.isCorrect).length;
    const answered = rows.filter((a) => a.selected !== null).length;
    return { subject, answered, correct, total, score: scoreOf(correct, total) };
  }).filter((s) => s.total > 0);
}

export interface PassVerdict {
  passed: boolean;
  totalScore: number;
  reasons: string[];
}

/**
 * 套用官方及格規則。
 *
 * 只有「兩科都考」才談得上及格 —— 單科練習沒有官方及格標準可套，
 * 這種情況回傳 passed=false 並在 reasons 說明，而不是假裝算得出結果。
 */
export function evaluatePass(scores: readonly SubjectScore[]): PassVerdict {
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const reasons: string[] = [];

  if (scores.length < EXAM_SUBJECTS.length) {
    const missing = EXAM_SUBJECTS.filter(
      (s) => !scores.some((x) => x.subject === s)
    );
    reasons.push(
      `未涵蓋 ${missing.join('、')}，無法套用官方及格標準（正式測驗兩科都要考）`
    );
    return { passed: false, totalScore, reasons };
  }

  for (const s of scores) {
    if (s.score < PASS_PER_SUBJECT) {
      reasons.push(`${s.subject} ${s.score} 分，未達單科最低 ${PASS_PER_SUBJECT} 分`);
    }
  }
  if (totalScore < PASS_TOTAL) {
    reasons.push(`兩科總分 ${totalScore} 分，未達 ${PASS_TOTAL} 分`);
  }

  return { passed: reasons.length === 0, totalScore, reasons };
}
