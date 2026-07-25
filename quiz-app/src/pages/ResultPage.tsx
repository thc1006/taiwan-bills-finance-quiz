import { useMemo, useState } from 'react';
import type { AnswerRecord, QuizQuestion, QuizResult } from '../types/quiz';
import { getById } from '../data/questions';
import { QuestionCard } from '../components/QuestionCard';
import { PASS_PER_SUBJECT, PASS_TOTAL } from '../utils/scoring';

export interface ResultPageProps {
  result: QuizResult;
  onRetry: () => void;
  onHome: () => void;
  onReviewWrong: () => void;
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} 分 ${s % 60} 秒` : `${s} 秒`;
}

interface ReviewRow {
  a: AnswerRecord;
  q: QuizQuestion;
}

export function ResultPage({ result, onRetry, onHome, onReviewWrong }: ResultPageProps) {
  const [filter, setFilter] = useState<'wrong' | 'all'>('wrong');

  const answers = result.answers;
  const rows = useMemo<ReviewRow[]>(
    () =>
      answers
        .filter((a) => (filter === 'wrong' ? !a.isCorrect : true))
        .map((a) => ({ a, q: getById(a.questionId) }))
        // 題庫換版後，舊結果可能引用到已不存在的題 id —— 直接略過，
        // 而不是讓 undefined 一路傳進 QuestionCard 炸掉整頁。
        .filter((r): r is ReviewRow => r.q !== undefined),
    [answers, filter]
  );

  const isMock = result.config.mode === 'mock';
  const totalScore = result.subjectScores.reduce((s, x) => s + x.score, 0);

  return (
    <div className="result">
      <section className={`card verdict ${result.passed === true ? 'pass' : result.passed === false ? 'fail' : ''}`}>
        {isMock ? (
          <>
            <h1>{result.passed ? '✅ 模擬結果：合格' : '❌ 模擬結果：不合格'}</h1>
            <p className="verdict-sub">
              兩科總分 <strong>{totalScore}</strong> 分（門檻 {PASS_TOTAL}），
              單科門檻 {PASS_PER_SUBJECT} 分
            </p>
            {result.failReasons.length > 0 && (
              <ul className="fail-reasons">
                {result.failReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <p className="note">
              本結果依官方簡章的及格規則計算，但題目來自練習題庫而非真實試卷，
              分數不代表實際應試結果。
            </p>
          </>
        ) : (
          <>
            <h1>練習完成</h1>
            <p className="verdict-sub">
              答對 <strong>{result.correctCount}</strong> / {result.answers.length} 題
              （{result.accuracy}%）
            </p>
            <p className="note">
              練習模式不套用官方及格標準 —— 只有兩科各 50 題的模擬考才有可比性。
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>分科成績</h2>
        <table className="score-table">
          <thead>
            <tr>
              <th>科目</th>
              <th>答對</th>
              <th>題數</th>
              <th>換算分數</th>
              {isMock && <th>單科門檻</th>}
            </tr>
          </thead>
          <tbody>
            {result.subjectScores.map((s) => (
              <tr key={s.subject}>
                <th>{s.subject}</th>
                <td>{s.correct}</td>
                <td>{s.total}</td>
                <td>
                  <strong>{s.score}</strong>
                </td>
                {isMock && (
                  <td className={s.score >= PASS_PER_SUBJECT ? 'ok' : 'bad'}>
                    {s.score >= PASS_PER_SUBJECT ? '通過' : `差 ${PASS_PER_SUBJECT - s.score} 分`}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          作答時間 {fmtDuration(result.totalTime)} · 未作答 {result.skippedCount} 題
          （未作答一律計為答錯）
        </p>
      </section>

      <section className="card">
        <div className="review-head">
          <h2>逐題檢討</h2>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn ${filter === 'wrong' ? 'on' : ''}`}
              onClick={() => setFilter('wrong')}
            >
              只看錯題（{result.answers.filter((a) => !a.isCorrect).length}）
            </button>
            <button
              type="button"
              className={`seg-btn ${filter === 'all' ? 'on' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部（{result.answers.length}）
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="note">這一份全對，沒有錯題可檢討。</p>
        ) : (
          rows.map(({ a, q }, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={i}
              total={rows.length}
              selected={a.selected}
              revealed
              onSelect={() => undefined}
            />
          ))
        )}
      </section>

      <div className="actions">
        <button type="button" className="btn-primary" onClick={onRetry}>
          再做一份
        </button>
        {result.wrongCount + result.skippedCount > 0 && (
          <button type="button" className="btn-ghost" onClick={onReviewWrong}>
            複習錯題
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onHome}>
          回首頁
        </button>
      </div>
    </div>
  );
}
