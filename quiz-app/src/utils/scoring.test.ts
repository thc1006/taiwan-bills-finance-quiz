import { describe, expect, it } from 'vitest';
import {
  PASS_PER_SUBJECT,
  PASS_TOTAL,
  computeSubjectScores,
  evaluatePass,
  scoreOf,
} from './scoring';
import type { AnswerRecord, ExamSubject, SubjectScore } from '../types/quiz';

const LAW: ExamSubject = '票券金融法規';
const PRACTICE: ExamSubject = '票券金融實務';

function score(subject: ExamSubject, s: number): SubjectScore {
  return { subject, answered: 50, correct: s / 2, total: 50, score: s };
}

function answers(subject: ExamSubject, correct: number, total: number): AnswerRecord[] {
  return Array.from({ length: total }, (_, i) => ({
    questionId: `${subject}-${i}`,
    subject,
    selected: i < correct ? 'A' : 'B',
    correct: 'A',
    isCorrect: i < correct,
    timeSpent: 0,
  }));
}

describe('scoreOf', () => {
  it('依比例換算為滿分 100', () => {
    expect(scoreOf(50, 50)).toBe(100);
    expect(scoreOf(30, 50)).toBe(60);
    expect(scoreOf(0, 50)).toBe(0);
  });

  it('題數為 0 時回傳 0，不製造看起來合理的分數', () => {
    expect(scoreOf(0, 0)).toBe(0);
    expect(scoreOf(5, 0)).toBe(0);
  });

  it('四捨五入至整數', () => {
    expect(scoreOf(1, 3)).toBe(33);
    expect(scoreOf(2, 3)).toBe(67);
  });
});

describe('evaluatePass —— 官方及格規則', () => {
  it('兩科都 70：總分 140 達標且單科達標 → 合格', () => {
    const v = evaluatePass([score(LAW, 70), score(PRACTICE, 70)]);
    expect(v.totalScore).toBe(140);
    expect(v.passed).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it('總分剛好 140 是及格（門檻為「達」，非「超過」）', () => {
    const v = evaluatePass([score(LAW, 80), score(PRACTICE, 60)]);
    expect(v.totalScore).toBe(PASS_TOTAL);
    expect(v.passed).toBe(true);
  });

  it('單科剛好 60 是及格', () => {
    expect(evaluatePass([score(LAW, 90), score(PRACTICE, 60)]).passed).toBe(true);
  });

  /**
   * 這是本規則最常被誤解的一點，也是這支測試存在的主要理由：
   * 總分 150 > 140 看起來過了，但實務科 50 分未達單科門檻 60，實際不合格。
   * 只看總分的實作會在這裡回報「合格」，讓使用者誤判自己的準備程度。
   */
  it('總分超過 140 但單科低於 60 → 不合格', () => {
    const v = evaluatePass([score(LAW, 100), score(PRACTICE, 50)]);
    expect(v.totalScore).toBe(150);
    expect(v.passed).toBe(false);
    expect(v.reasons.join()).toContain('票券金融實務');
    expect(v.reasons.join()).toContain(String(PASS_PER_SUBJECT));
  });

  it('兩科都達單科門檻但總分不足 → 不合格', () => {
    const v = evaluatePass([score(LAW, 62), score(PRACTICE, 60)]);
    expect(v.totalScore).toBe(122);
    expect(v.passed).toBe(false);
    expect(v.reasons.join()).toContain('總分');
  });

  it('兩科都不及格時，兩個原因都要列出', () => {
    const v = evaluatePass([score(LAW, 40), score(PRACTICE, 50)]);
    expect(v.passed).toBe(false);
    expect(v.reasons.length).toBe(3); // 兩科單科不足 + 總分不足
  });

  it('只考一科時不套用及格標準，並說明原因', () => {
    const v = evaluatePass([score(LAW, 100)]);
    expect(v.passed).toBe(false);
    expect(v.reasons.join()).toContain('票券金融實務');
    expect(v.reasons.join()).toContain('無法套用');
  });

  it('完全沒有成績時不會宣稱及格', () => {
    expect(evaluatePass([]).passed).toBe(false);
  });
});

describe('computeSubjectScores', () => {
  it('依科目分組計算', () => {
    const rows = [...answers(LAW, 40, 50), ...answers(PRACTICE, 25, 50)];
    const scores = computeSubjectScores(rows);
    expect(scores).toHaveLength(2);
    expect(scores.find((s) => s.subject === LAW)?.score).toBe(80);
    expect(scores.find((s) => s.subject === PRACTICE)?.score).toBe(50);
  });

  it('未出題的科目不會出現在成績中（避免 0 分假成績）', () => {
    const scores = computeSubjectScores(answers(LAW, 10, 20));
    expect(scores).toHaveLength(1);
    expect(scores[0]?.subject).toBe(LAW);
  });

  /**
   * 跳過的題必須算進分母。若分母只算「有按下去的題」，
   * 跳過 30 題、答對 20 題會顯示 100 分 —— 那是在騙自己。
   */
  it('未作答計入分母且視為答錯', () => {
    const rows: AnswerRecord[] = [
      ...answers(LAW, 20, 20),
      ...Array.from({ length: 30 }, (_, i) => ({
        questionId: `skip-${i}`,
        subject: LAW,
        selected: null,
        correct: 'A' as const,
        isCorrect: false,
        timeSpent: 0,
      })),
    ];
    const scores = computeSubjectScores(rows);
    expect(scores[0]?.total).toBe(50);
    expect(scores[0]?.correct).toBe(20);
    expect(scores[0]?.answered).toBe(20);
    expect(scores[0]?.score).toBe(40);
  });

  it('可用 totalsBySubject 指定分母（考卷題數 ≠ 作答紀錄數時）', () => {
    const scores = computeSubjectScores(answers(LAW, 25, 25), { [LAW]: 50 });
    expect(scores[0]?.score).toBe(50);
  });
});
