import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnswerRecord, ExamSubject, QuizConfig, QuizQuestion } from '../types/quiz';
import { QuestionCard } from '../components/QuestionCard';

export interface QuizPageProps {
  config: QuizConfig;
  questions: QuizQuestion[];
  index: number;
  answers: AnswerRecord[];
  onSelect: (key: 'A' | 'B' | 'C' | 'D') => void;
  onSkip: () => void;
  onNext: () => void;
  onPrev: () => void;
  onGoTo: (i: number) => void;
  onFinish: () => void;
  onAbort: () => void;
  /** 每節時限（秒）。模擬考為官方的 60 分鐘；其餘模式不計時。 */
  sectionSeconds?: number;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function QuizPage({
  config,
  questions,
  index,
  answers,
  onSelect,
  onSkip,
  onNext,
  onPrev,
  onGoTo,
  onFinish,
  onAbort,
  sectionSeconds = 60 * 60,
}: QuizPageProps) {
  const isMock = config.mode === 'mock';
  const current = questions[index];

  const answerMap = useMemo(
    () => new Map(answers.map((a) => [a.questionId, a])),
    [answers]
  );

  // ── 分節計時（僅模擬考）──────────────────────────────
  // 正式測驗是兩個獨立的 60 分鐘節次，時間不能互相挪用。
  // 這裡照做，但時間到**不強制中斷**：練習工具把人踢出去沒有意義，
  // 改為顯示超時橫幅並在結果頁誠實標記「本節超時」。
  const sectionOf = (q: QuizQuestion | undefined): ExamSubject | null =>
    q ? q.subject : null;
  const section = sectionOf(current);
  const [now, setNow] = useState(() => Date.now());
  const sectionStart = useRef<Record<string, number>>({});
  const overtime = useRef<Set<string>>(new Set());

  if (isMock && section && sectionStart.current[section] === undefined) {
    sectionStart.current[section] = Date.now();
  }

  useEffect(() => {
    if (!isMock) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isMock]);

  const started = section ? sectionStart.current[section] : undefined;
  const remain =
    isMock && started !== undefined
      ? sectionSeconds - (now - started) / 1000
      : null;
  if (remain !== null && remain <= 0 && section) overtime.current.add(section);

  if (!current) {
    return (
      <div className="quiz-empty card">
        <p>沒有符合條件的題目。</p>
        <button type="button" className="btn-primary" onClick={onAbort}>
          回首頁
        </button>
      </div>
    );
  }

  const answered = answerMap.get(current.id);
  const revealed = config.showAnswerImmediately && answered !== undefined;
  const isLast = index === questions.length - 1;
  const doneCount = answers.length;

  return (
    <div className="quiz">
      <div className="quiz-bar">
        <div className="progress" aria-label={`進度 ${doneCount} / ${questions.length}`}>
          <div
            className="progress-fill"
            style={{ width: `${(doneCount / questions.length) * 100}%` }}
          />
        </div>
        <span className="quiz-count">
          已答 {doneCount} / {questions.length}
        </span>
        {isMock && (
          <span className={`timer ${remain !== null && remain <= 300 ? 'warn' : ''}`}>
            {section} · {remain !== null && remain > 0 ? fmt(remain) : '時間到'}
          </span>
        )}
        <button type="button" className="btn-ghost" onClick={onAbort}>
          中止
        </button>
      </div>

      {isMock && section && overtime.current.has(section) && (
        <p className="overtime-banner" role="status">
          ⏰ 本節（{section}）已超過官方時限 {sectionSeconds / 60} 分鐘。
          你可以繼續作答，結果頁會標記本節超時。
        </p>
      )}

      <QuestionCard
        question={current}
        index={index}
        total={questions.length}
        selected={answered ? answered.selected : undefined}
        revealed={revealed}
        onSelect={onSelect}
      />

      <div className="quiz-nav">
        <button type="button" onClick={onPrev} disabled={index === 0} className="btn-ghost">
          ← 上一題
        </button>
        {answered === undefined && (
          <button type="button" onClick={onSkip} className="btn-ghost">
            跳過
          </button>
        )}
        {isLast ? (
          <button type="button" onClick={onFinish} className="btn-primary">
            交卷
          </button>
        ) : (
          <button type="button" onClick={onNext} className="btn-primary">
            下一題 →
          </button>
        )}
      </div>

      <nav className="q-jump" aria-label="題號導覽">
        {questions.map((q, i) => {
          const a = answerMap.get(q.id);
          const cls =
            i === index
              ? 'jump cur'
              : a === undefined
                ? 'jump'
                : a.selected === null
                  ? 'jump skipped'
                  : config.showAnswerImmediately
                    ? a.isCorrect
                      ? 'jump ok'
                      : 'jump bad'
                    : 'jump done';
          return (
            <button key={q.id} type="button" className={cls} onClick={() => onGoTo(i)}>
              {i + 1}
            </button>
          );
        })}
      </nav>

      <div className="quiz-foot">
        <button type="button" onClick={onFinish} className="btn-ghost">
          提前交卷
        </button>
      </div>
    </div>
  );
}
