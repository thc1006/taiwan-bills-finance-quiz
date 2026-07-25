import { useCallback, useMemo, useState } from 'react';
import type {
  AnswerRecord,
  ExamSubject,
  QuizConfig,
  QuizQuestion,
  QuizResult,
} from '../types/quiz';
import { drawQuestions, getById, getPool } from '../data/questions';
import { fingerprint } from '../utils/question-identity';
import { sample, shuffle } from '../utils/shuffle';
import { computeSubjectScores, evaluatePass } from '../utils/scoring';
import { readJSON, writeJSON } from '../utils/storage';

/** 正式測驗每科題數（官方簡章 115.05.01） */
export const MOCK_PER_SUBJECT = 50;

const WRONG_KEY = 'wrong-ids';

export const defaultConfig: QuizConfig = {
  mode: 'practice',
  subject: 'all',
  questionCount: 20,
  tags: [],
  officialOnly: false,
  showAnswerImmediately: true,
};

interface QuizState {
  active: boolean;
  questions: QuizQuestion[];
  index: number;
  answers: AnswerRecord[];
  startedAt: number;
  questionStartedAt: number;
  config: QuizConfig;
}

const idle: QuizState = {
  active: false,
  questions: [],
  index: 0,
  answers: [],
  startedAt: 0,
  questionStartedAt: 0,
  config: defaultConfig,
};

export function loadWrongIds(): string[] {
  return readJSON<string[]>(WRONG_KEY, []);
}

function persistWrongIds(ids: readonly string[]): void {
  writeJSON(WRONG_KEY, [...new Set(ids)]);
}

/**
 * 依 config 組出考卷。
 *
 * mock 模式**不使用** config.subject / questionCount —— 它固定照官方結構出卷：
 * 兩科各 50 題。若某科題庫不足 50 題（目前 574 / 663，不會發生），
 * 就出該科的全部，並在結果頁以實際題數換算分數，而不是硬湊。
 */
export function buildPaper(config: QuizConfig): QuizQuestion[] {
  if (config.mode === 'mock') {
    // 兩科分開抽，但**必須跨科去重**。
    //
    // 官方公會題庫本身就有跨科重複：例如法規 #174 與實務 #416 是同一題
    // （「甲票券金融公司…資本適足率低於多少」，選項一個寫 0.15、一個寫 15%）。
    // 資料層兩份都要保留 —— 只練一科的人不該少一題 —— 但同一份模擬考卷
    // 若兩科各出一次，使用者會在第 N 題和第 N+50 題看到同一題。
    const first = drawQuestions(
      { subject: '票券金融法規', tags: config.tags, officialOnly: config.officialOnly },
      MOCK_PER_SUBJECT
    );
    const used = new Set(first.map((q) => fingerprint(q)));
    const second = getPool({
      subject: '票券金融實務',
      tags: config.tags,
      officialOnly: config.officialOnly,
    }).filter((q) => !used.has(fingerprint(q)));
    return [...first, ...sample(second, MOCK_PER_SUBJECT)];
  }

  if (config.mode === 'wrong') {
    const wrong = loadWrongIds()
      .map(getById)
      .filter((q): q is QuizQuestion => q !== undefined)
      .filter((q) => config.subject === 'all' || q.subject === config.subject);
    return shuffle(wrong).slice(0, config.questionCount);
  }

  return drawQuestions(
    {
      subject: config.subject,
      tags: config.tags,
      officialOnly: config.officialOnly,
    },
    config.questionCount
  );
}

export function useQuiz() {
  const [state, setState] = useState<QuizState>(idle);

  const start = useCallback((config: QuizConfig): number => {
    const questions = buildPaper(config);
    const now = Date.now();
    setState({
      active: questions.length > 0,
      questions,
      index: 0,
      answers: [],
      startedAt: now,
      questionStartedAt: now,
      config,
    });
    return questions.length;
  }, []);

  const current = state.questions[state.index];

  /**
   * 作答。回傳是否答對；重複作答同一題會被忽略（回傳 null）。
   *
   * 副作用（寫錯題本）與回傳值都**不能**放在 setState 的 updater 裡：
   *   - StrictMode 會刻意重複呼叫 updater，副作用會跑兩次
   *   - updater 不保證同步執行，靠閉包變數把結果傳出來會拿到 null
   * 所以這裡直接讀 state（useCallback 依賴 state，每次 render 重建），
   * setState 內只留純粹的狀態轉換，並保留同一道防重複的守衛。
   */
  const answer = useCallback(
    (selected: 'A' | 'B' | 'C' | 'D' | null): boolean | null => {
      const q = state.questions[state.index];
      if (!q) return null;
      if (state.answers.some((a) => a.questionId === q.id)) return null;

      const isCorrect = selected === q.answer;
      const record: AnswerRecord = {
        questionId: q.id,
        subject: q.subject,
        selected,
        correct: q.answer,
        isCorrect,
        timeSpent: Date.now() - state.questionStartedAt,
      };

      // 錯題（含跳過）記進 localStorage，供「錯題複習」模式使用。
      // 答對則移除 —— 否則錯題本只會愈長愈長，永遠清不掉。
      const wrong = new Set(loadWrongIds());
      if (isCorrect) wrong.delete(q.id);
      else wrong.add(q.id);
      persistWrongIds([...wrong]);

      setState((prev) =>
        prev.answers.some((a) => a.questionId === q.id)
          ? prev
          : { ...prev, answers: [...prev.answers, record] }
      );
      return isCorrect;
    },
    [state]
  );

  const next = useCallback(() => {
    setState((prev) =>
      prev.index + 1 < prev.questions.length
        ? { ...prev, index: prev.index + 1, questionStartedAt: Date.now() }
        : prev
    );
  }, []);

  const prev = useCallback(() => {
    setState((s) =>
      s.index > 0 ? { ...s, index: s.index - 1, questionStartedAt: Date.now() } : s
    );
  }, []);

  const goTo = useCallback((i: number) => {
    setState((s) =>
      i >= 0 && i < s.questions.length
        ? { ...s, index: i, questionStartedAt: Date.now() }
        : s
    );
  }, []);

  /**
   * 結算。
   *
   * 未作答的題會補成 selected=null 的錯誤紀錄 —— 否則分母只算「有按下去的題」，
   * 跳過 30 題只答對 20 題會顯示 100 分，那是在騙自己。
   */
  const finish = useCallback((): QuizResult => {
    const answered = new Map(state.answers.map((a) => [a.questionId, a]));
    const full: AnswerRecord[] = state.questions.map(
      (q) =>
        answered.get(q.id) ?? {
          questionId: q.id,
          subject: q.subject,
          selected: null,
          correct: q.answer,
          isCorrect: false,
          timeSpent: 0,
        }
    );

    const totalsBySubject: Partial<Record<ExamSubject, number>> = {};
    for (const q of state.questions) {
      totalsBySubject[q.subject] = (totalsBySubject[q.subject] ?? 0) + 1;
    }

    const subjectScores = computeSubjectScores(full, totalsBySubject);
    const verdict = evaluatePass(subjectScores);
    const correctCount = full.filter((a) => a.isCorrect).length;
    const skippedCount = full.filter((a) => a.selected === null).length;
    const finishedAt = Date.now();

    setState(idle);

    return {
      config: state.config,
      startedAt: state.startedAt,
      finishedAt,
      totalTime: finishedAt - state.startedAt,
      answers: full,
      correctCount,
      wrongCount: full.length - correctCount - skippedCount,
      skippedCount,
      accuracy: full.length ? Math.round((correctCount / full.length) * 100) : 0,
      subjectScores,
      // 及格判定只在 mock 模式下有官方意義；練習模式不給 pass/fail 標籤，
      // 免得 20 題練習的「及格」被誤讀成真的會過。
      passed: state.config.mode === 'mock' ? verdict.passed : null,
      failReasons: state.config.mode === 'mock' ? verdict.reasons : [],
    };
  }, [state]);

  const abort = useCallback(() => setState(idle), []);

  const answeredCurrent = useMemo(
    () => (current ? state.answers.find((a) => a.questionId === current.id) : undefined),
    [current, state.answers]
  );

  return {
    active: state.active,
    questions: state.questions,
    index: state.index,
    current,
    answers: state.answers,
    answeredCurrent,
    config: state.config,
    startedAt: state.startedAt,
    start,
    answer,
    next,
    prev,
    goTo,
    finish,
    abort,
  };
}

/** 錯題數（供首頁顯示；會濾掉已不存在於題庫的 id） */
export function countWrong(subject: ExamSubject | 'all' = 'all'): number {
  return loadWrongIds()
    .map(getById)
    .filter((q): q is QuizQuestion => q !== undefined)
    .filter((q) => subject === 'all' || q.subject === subject).length;
}

/** 清空錯題本 */
export function clearWrong(): void {
  persistWrongIds([]);
}

/** 供首頁顯示可用題數 */
export function poolSize(config: Pick<QuizConfig, 'subject' | 'tags' | 'officialOnly'>): number {
  return getPool({
    subject: config.subject,
    tags: config.tags,
    officialOnly: config.officialOnly,
  }).length;
}
