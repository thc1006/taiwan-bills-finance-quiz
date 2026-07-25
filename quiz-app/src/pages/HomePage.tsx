import { useMemo, useState } from 'react';
import type { ExamSubject, QuizConfig, QuizMode } from '../types/quiz';
import { allTags, meta, sources, stats } from '../data/questions';
import { MOCK_PER_SUBJECT, clearWrong, countWrong, poolSize } from '../hooks/useQuiz';
import { PASS_PER_SUBJECT, PASS_TOTAL } from '../utils/scoring';

export interface HomePageProps {
  onStart: (config: QuizConfig) => void;
}

const COUNT_OPTIONS = [10, 20, 30, 50, 100];

export function HomePage({ onStart }: HomePageProps) {
  const [mode, setMode] = useState<QuizMode>('practice');
  const [subject, setSubject] = useState<ExamSubject | 'all'>('all');
  const [count, setCount] = useState(20);
  const [tags, setTags] = useState<string[]>([]);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [wrongVersion, setWrongVersion] = useState(0);

  // wrongVersion 只是為了在「清空錯題本」後強制重算 —— 錯題數存在
  // localStorage，React 看不到它的變動，需要一個顯式的失效訊號。
  const wrongCount = useMemo(() => {
    void wrongVersion;
    return countWrong(subject);
  }, [subject, wrongVersion]);
  const available = useMemo(
    () => poolSize({ subject, tags, officialOnly }),
    [subject, tags, officialOnly]
  );

  // 模擬考必須忠於官方結構，因此**不套用標籤篩選**：
  // 用「計算題」篩出 16 題再宣告「合格／不合格」，那個結論沒有意義。
  // officialOnly 保留 —— 官方題庫兩科各 240 題，足夠出 50+50。
  const config: QuizConfig = {
    mode,
    subject,
    questionCount: count,
    tags: mode === 'mock' ? [] : tags,
    officialOnly,
    showAnswerImmediately: mode !== 'mock',
  };

  // 模擬考要兩科各湊滿 50 題才成立，因此取兩科的較小值判斷可否開始。
  const mockAvailable = useMemo(
    () =>
      Math.min(
        poolSize({ subject: '票券金融法規', tags: [], officialOnly }),
        poolSize({ subject: '票券金融實務', tags: [], officialOnly })
      ),
    [officialOnly]
  );

  const startable =
    mode === 'mock'
      ? mockAvailable >= MOCK_PER_SUBJECT
      : mode === 'wrong'
        ? wrongCount > 0
        : available > 0;

  const audit = meta.law_citation_audit;

  return (
    <div className="home">
      <section className="hero">
        <h1>票券商業務人員 專業科目測驗</h1>
        <p className="hero-sub">
          {stats.total.toLocaleString()} 題練習題庫 · {stats.withLawText} 題附現行法條原文對照
        </p>
      </section>

      {/* ── 考試規則（唯一權威來源：官方簡章） ── */}
      <section className="card exam-spec">
        <h2>考試規則</h2>
        <table>
          <tbody>
            {meta.exam.subjects.map((s) => (
              <tr key={s.name}>
                <th>{s.name}</th>
                <td>
                  {s.questions} 題 · {s.minutes} 分鐘 · 滿分 {s.full_marks} 分
                </td>
              </tr>
            ))}
            <tr>
              <th>合格標準</th>
              <td className="pass-rule">
                兩科總分合計達 <strong>{PASS_TOTAL}</strong> 分，
                且<strong>任一科不得低於 {PASS_PER_SUBJECT} 分</strong>
              </td>
            </tr>
            <tr>
              <th>報名費</th>
              <td>NT$ {meta.exam.fee_twd.toLocaleString()}</td>
            </tr>
            <tr>
              <th>委託／執行</th>
              <td>
                {meta.exam.commissioner} 委託 {meta.exam.administrator} 辦理
              </td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          依官方簡章 {meta.exam.brochure_version} 版。網路上常見「實務 80 題 ／ 90 分鐘」「任一科低於
          70 分不合格」的說法為過時或錯誤資訊。
        </p>
      </section>

      {/* ── 出題設定 ── */}
      <section className="card">
        <h2>開始練習</h2>

        <fieldset className="field">
          <legend>模式</legend>
          <div className="seg">
            {(
              [
                ['practice', '練習模式', '自選範圍，作答後立即看答案與法條'],
                ['mock', '模擬考', `兩科各 ${MOCK_PER_SUBJECT} 題，套用真實及格規則`],
                ['wrong', '錯題複習', `目前有 ${wrongCount} 題`],
              ] as const
            ).map(([m, label, hint]) => (
              <button
                key={m}
                type="button"
                className={`seg-btn ${mode === m ? 'on' : ''}`}
                onClick={() => setMode(m)}
              >
                <strong>{label}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </fieldset>

        {mode !== 'mock' && (
          <>
            <fieldset className="field">
              <legend>科目</legend>
              <div className="seg">
                {(['all', '票券金融法規', '票券金融實務'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`seg-btn ${subject === s ? 'on' : ''}`}
                    onClick={() => setSubject(s)}
                  >
                    {s === 'all' ? '全部' : s}
                    <small>
                      {s === 'all'
                        ? `${stats.total} 題`
                        : `${stats.bySubject[s]} 題`}
                    </small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend>題數</legend>
              <div className="seg">
                {COUNT_OPTIONS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`seg-btn ${count === c ? 'on' : ''}`}
                    onClick={() => setCount(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <fieldset className="field">
          <legend>篩選</legend>
          <div className="chips">
            {/* 標籤篩選只在非模擬考模式提供 —— 見上方 config 的說明 */}
            {mode !== 'mock' &&
              allTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`chip ${tags.includes(t) ? 'on' : ''}`}
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                    )
                  }
                >
                  {t}
                </button>
              ))}
            <button
              type="button"
              className={`chip ${officialOnly ? 'on' : ''}`}
              onClick={() => setOfficialOnly((v) => !v)}
              title="只出票券公會官方釋出的 480 題參考題庫"
            >
              只用官方題庫
            </button>
          </div>
          {mode === 'mock' ? (
            <p className="note">
              模擬考不套用標籤篩選，以維持與正式測驗相同的出題結構
              （兩科各 {MOCK_PER_SUBJECT} 題）。可用題數：法規／實務各{' '}
              <strong>{mockAvailable}</strong> 題以上。
            </p>
          ) : (
            <p className="note">
              符合條件：<strong>{available}</strong> 題
              {mode === 'practice' && available < count && available > 0 && (
                <>（不足 {count} 題，將出 {available} 題）</>
              )}
            </p>
          )}
        </fieldset>

        <div className="actions">
          <button
            type="button"
            className="btn-primary"
            disabled={!startable}
            onClick={() => onStart(config)}
          >
            {mode === 'mock'
              ? `開始模擬考（${MOCK_PER_SUBJECT * 2} 題）`
              : mode === 'wrong'
                ? `複習 ${Math.min(wrongCount, count)} 題錯題`
                : `開始練習（${Math.min(available, count)} 題）`}
          </button>
          {mode === 'wrong' && wrongCount > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                clearWrong();
                setWrongVersion((v) => v + 1);
              }}
            >
              清空錯題本
            </button>
          )}
        </div>
        {!startable && mode === 'wrong' && (
          <p className="note">還沒有錯題紀錄 —— 先做幾題練習吧。</p>
        )}
      </section>

      {/* ── 資料誠實揭露 ── */}
      <section className="card provenance">
        <h2>這些題目從哪來、可信到什麼程度</h2>
        <ul className="stat-grid">
          <li>
            <b>{stats.official}</b>
            <span>官方公會題庫</span>
          </li>
          <li>
            <b>{stats.community}</b>
            <span>社群考古題整理</span>
          </li>
          <li>
            <b>{stats.withExplanation}</b>
            <span>附解析</span>
          </li>
          <li>
            <b>{stats.withLawText}</b>
            <span>附現行法條原文</span>
          </li>
        </ul>

        <div className="warn-box">
          <h3>⚠ 沒有任何一題的答案經過逐條核對</h3>
          <p>{meta.answer_verification.note}</p>
        </div>

        <h3>引用法條稽核</h3>
        <p>
          以 {audit.corpus.laws} 部票券法規（{audit.corpus.articles} 條，擷取自
          {audit.corpus.source}，{audit.corpus.retrieved_at}）比對每題解析引用的條號：
        </p>
        <ul className="audit-list">
          <li>
            引用條文現行仍存在：<b>{audit.counts['verified_article_exists'] ?? 0}</b> 題
          </li>
          <li>
            引用條號已不存在（過時風險）：<b>{audit.counts['article_not_found'] ?? 0}</b> 題
          </li>
          <li>
            引用他法／函令，未查證：
            <b>
              {(audit.counts['law_outside_corpus'] ?? 0) +
                (audit.counts['cited_document_not_in_corpus'] ?? 0)}
            </b>{' '}
            題
          </li>
          <li>
            解析未引用可辨識的條號：<b>{audit.counts['no_citation'] ?? 0}</b> 題
          </li>
        </ul>
        <p className="note">{audit.what_this_means}</p>

        <h3>資料來源</h3>
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.source_id}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.title}
              </a>
              <span className={`badge ${s.authority === 'official' ? 'badge-ok' : 'badge-neutral'}`}>
                {s.publisher}
              </span>
              <small>{s.note}</small>
            </li>
          ))}
        </ul>
      </section>

      <footer className="site-foot">
        <p>
          本工具為非官方備考練習資源，與中華民國票券金融商業同業公會、證券暨期貨市場發展基金會
          均無隸屬關係。考試規則以官方簡章為準；法規以全國法規資料庫現行條文為準。
        </p>
      </footer>
    </div>
  );
}
