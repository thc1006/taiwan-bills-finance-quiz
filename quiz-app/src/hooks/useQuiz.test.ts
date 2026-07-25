import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MOCK_PER_SUBJECT,
  buildPaper,
  clearWrong,
  countWrong,
  defaultConfig,
  loadWrongIds,
  poolSize,
  useQuiz,
} from './useQuiz';
import type { QuizConfig } from '../types/quiz';
import { allQuestions } from '../data/questions';
import { fingerprint } from '../utils/question-identity';

const cfg = (over: Partial<QuizConfig> = {}): QuizConfig => ({
  ...defaultConfig,
  ...over,
});

beforeEach(() => {
  clearWrong();
});

describe('buildPaper', () => {
  it('練習模式抽出指定題數', () => {
    expect(buildPaper(cfg({ questionCount: 15 }))).toHaveLength(15);
  });

  it('練習模式可依科目過濾', () => {
    const paper = buildPaper(cfg({ subject: '票券金融法規', questionCount: 30 }));
    expect(paper.every((q) => q.subject === '票券金融法規')).toBe(true);
  });

  it('officialOnly 只抽官方公會題庫', () => {
    const paper = buildPaper(cfg({ officialOnly: true, questionCount: 40 }));
    expect(
      paper.every((q) => q.provenance.source_type === 'official_association_bank')
    ).toBe(true);
  });

  it('tags 過濾為 AND 條件', () => {
    const paper = buildPaper(cfg({ tags: ['計算題'], questionCount: 50 }));
    expect(paper.length).toBeGreaterThan(0);
    expect(paper.every((q) => q.tags.includes('計算題'))).toBe(true);
  });

  it('要求題數超過題池時，回傳題池全部而非重複補齊', () => {
    const available = poolSize({ subject: 'all', tags: ['計算題'], officialOnly: false });
    const paper = buildPaper(cfg({ tags: ['計算題'], questionCount: 9999 }));
    expect(paper).toHaveLength(available);
    expect(new Set(paper.map((q) => q.id)).size).toBe(paper.length);
  });

  /** 模擬考必須忠於官方結構：兩科各 50 題，且不受 subject/questionCount 影響。 */
  it('模擬考固定兩科各 50 題', () => {
    const paper = buildPaper(cfg({ mode: 'mock', subject: '票券金融法規', questionCount: 5 }));
    expect(paper).toHaveLength(MOCK_PER_SUBJECT * 2);
    expect(paper.filter((q) => q.subject === '票券金融法規')).toHaveLength(MOCK_PER_SUBJECT);
    expect(paper.filter((q) => q.subject === '票券金融實務')).toHaveLength(MOCK_PER_SUBJECT);
  });

  it('模擬考前 50 題為法規、後 50 題為實務（分節作答順序）', () => {
    const paper = buildPaper(cfg({ mode: 'mock' }));
    expect(paper.slice(0, 50).every((q) => q.subject === '票券金融法規')).toBe(true);
    expect(paper.slice(50).every((q) => q.subject === '票券金融實務')).toBe(true);
  });

  it('同一份考卷不出現重複的 id', () => {
    const paper = buildPaper(cfg({ mode: 'mock' }));
    expect(new Set(paper.map((q) => q.id)).size).toBe(paper.length);
  });

  /**
   * 只比 id 不夠 —— 官方題庫有跨科重複（法規 #174 = 實務 #416，
   * 兩者 id 不同但是同一題）。模擬考兩科分開抽，若不跨科去重，
   * 使用者會在第 N 題和第 N+50 題看到同一題。
   *
   * 跑多次以降低隨機抽題碰巧沒抽中那一組的機率。
   */
  it('同一份模擬考卷不出現內容重複題（跨科去重）', () => {
    for (let round = 0; round < 30; round++) {
      const paper = buildPaper(cfg({ mode: 'mock' }));
      const fps = paper.map((q) => fingerprint(q));
      expect(new Set(fps).size).toBe(paper.length);
    }
  });

  it('跨科去重後，模擬考仍維持兩科各 50 題', () => {
    const paper = buildPaper(cfg({ mode: 'mock' }));
    expect(paper.filter((q) => q.subject === '票券金融實務')).toHaveLength(
      MOCK_PER_SUBJECT
    );
  });

  it('錯題模式在沒有錯題時回傳空考卷', () => {
    expect(buildPaper(cfg({ mode: 'wrong' }))).toHaveLength(0);
  });
});

describe('useQuiz 作答流程', () => {
  it('start 回傳題數並啟用測驗', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      expect(result.current.start(cfg({ questionCount: 5 }))).toBe(5);
    });
    expect(result.current.active).toBe(true);
    expect(result.current.questions).toHaveLength(5);
  });

  it('答對時回報正確，並記錄作答', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 3 }));
    });
    const correct = result.current.questions[0]!.answer;
    act(() => {
      result.current.answer(correct);
    });
    expect(result.current.answers).toHaveLength(1);
    expect(result.current.answers[0]!.isCorrect).toBe(true);
  });

  /** 正式測驗不能改答案；允許改也會讓錯題本的對錯失去意義。 */
  it('同一題重複作答會被忽略', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 3 }));
    });
    const q = result.current.questions[0]!;
    const wrongKey = q.options.find((o) => o.key !== q.answer)!.key;
    act(() => {
      result.current.answer(wrongKey);
    });
    act(() => {
      result.current.answer(q.answer);
    });
    expect(result.current.answers).toHaveLength(1);
    expect(result.current.answers[0]!.isCorrect).toBe(false);
  });

  it('next / prev / goTo 在邊界不會越界', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 3 }));
    });
    act(() => result.current.prev());
    expect(result.current.index).toBe(0);
    act(() => result.current.goTo(99));
    expect(result.current.index).toBe(0);
    act(() => result.current.next());
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.index).toBe(2);
  });
});

describe('結算', () => {
  it('未作答的題會補成錯誤紀錄並計入分母', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ subject: '票券金融法規', questionCount: 10 }));
    });
    act(() => {
      result.current.answer(result.current.questions[0]!.answer);
    });
    let res!: ReturnType<typeof result.current.finish>;
    act(() => {
      res = result.current.finish();
    });
    expect(res.answers).toHaveLength(10);
    expect(res.skippedCount).toBe(9);
    expect(res.correctCount).toBe(1);
    expect(res.subjectScores[0]!.total).toBe(10);
    expect(res.subjectScores[0]!.score).toBe(10);
  });

  /** 練習模式沒有官方及格標準可套，不該貼 pass/fail 標籤。 */
  it('練習模式不給及格判定', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 5 }));
    });
    let res!: ReturnType<typeof result.current.finish>;
    act(() => {
      res = result.current.finish();
    });
    expect(res.passed).toBeNull();
    expect(res.failReasons).toEqual([]);
  });

  it('模擬考全對 → 兩科各 100 分、合格', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ mode: 'mock' }));
    });
    for (let i = 0; i < MOCK_PER_SUBJECT * 2; i++) {
      act(() => {
        result.current.answer(result.current.questions[i]!.answer);
        result.current.next();
      });
    }
    let res!: ReturnType<typeof result.current.finish>;
    act(() => {
      res = result.current.finish();
    });
    expect(res.subjectScores.map((s) => s.score)).toEqual([100, 100]);
    expect(res.passed).toBe(true);
  });

  it('模擬考全部跳過 → 不合格且列出原因', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ mode: 'mock' }));
    });
    let res!: ReturnType<typeof result.current.finish>;
    act(() => {
      res = result.current.finish();
    });
    expect(res.passed).toBe(false);
    expect(res.failReasons.length).toBeGreaterThan(0);
    expect(res.subjectScores.every((s) => s.score === 0)).toBe(true);
  });

  it('finish 後測驗結束', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 3 }));
    });
    act(() => {
      result.current.finish();
    });
    expect(result.current.active).toBe(false);
  });
});

describe('錯題本', () => {
  it('答錯會記錄，答對會移除', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 2 }));
    });
    const q = result.current.questions[0]!;
    const wrongKey = q.options.find((o) => o.key !== q.answer)!.key;
    act(() => {
      result.current.answer(wrongKey);
    });
    expect(loadWrongIds()).toContain(q.id);

    // 再考一次同一題並答對 —— 錯題本應該把它清掉，否則永遠清不完
    act(() => {
      result.current.start(cfg({ mode: 'wrong', questionCount: 10 }));
    });
    act(() => {
      result.current.answer(result.current.questions[0]!.answer);
    });
    expect(loadWrongIds()).not.toContain(q.id);
  });

  it('跳過也算錯，會進錯題本', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => {
      result.current.start(cfg({ questionCount: 2 }));
    });
    const id = result.current.questions[0]!.id;
    act(() => {
      result.current.answer(null);
    });
    expect(loadWrongIds()).toContain(id);
  });

  it('countWrong 會濾掉題庫中已不存在的 id', () => {
    localStorage.setItem('bfq:wrong-ids', JSON.stringify(['ghost-id', allQuestions[0]!.id]));
    expect(countWrong()).toBe(1);
  });

  it('clearWrong 清空', () => {
    localStorage.setItem('bfq:wrong-ids', JSON.stringify([allQuestions[0]!.id]));
    clearWrong();
    expect(loadWrongIds()).toEqual([]);
  });
});
