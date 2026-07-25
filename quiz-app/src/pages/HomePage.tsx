import { useMemo, useState } from 'react';
import type { ExamSubject, QuizConfig, QuizMode } from '../types/quiz';
import { allTags, meta, sources, stats } from '../data/questions';
import { MOCK_PER_SUBJECT, clearWrong, countWrong, poolSize } from '../hooks/useQuiz';
import { PASS_PER_SUBJECT, PASS_TOTAL } from '../utils/scoring';
import { AuditBar, type AuditSlice } from '../components/AuditBar';

export interface HomePageProps {
  onStart: (config: QuizConfig) => void;
}

const COUNT_OPTIONS = [10, 20, 30, 50, 100];

const MODES: { id: QuizMode; label: string; hint: (n: number) => string }[] = [
  { id: 'practice', label: '練習模式', hint: () => '自選範圍，作答後立即看答案與現行法條' },
  {
    id: 'mock',
    label: '模擬考',
    hint: () => `兩科各 ${MOCK_PER_SUBJECT} 題，分節計時，套用真實及格規則`,
  },
  { id: 'wrong', label: '錯題複習', hint: (n) => `只出做錯的題，目前有 ${n} 題` },
];

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
  const c = audit.counts;
  const auditSlices: AuditSlice[] = [
    {
      key: 'verified',
      label: '引用條文現行有效',
      value: c['verified_article_exists'] ?? 0,
      tone: 'v1',
      hint: '解析引用的條號仍存在於現行條文，且條文原文已嵌入該題。不代表答案正確。',
    },
    {
      key: 'notfound',
      label: '⚠ 引用條號已不存在',
      value: c['article_not_found'] ?? 0,
      tone: 'critical',
      hint: '引用的條號在現行條文中找不到，該題有過時風險。',
    },
    {
      key: 'unchecked',
      label: '引用他法／函令，未查證',
      value: (c['law_outside_corpus'] ?? 0) + (c['cited_document_not_in_corpus'] ?? 0),
      tone: 'v2',
      hint: '引用銀行法、中央銀行法或各類函令、自律規範，不在本工具的法規語料庫內。',
    },
    {
      key: 'none',
      label: '解析未引用可辨識條號',
      value: c['no_citation'] ?? 0,
      tone: 'v3',
      hint: '解析沒有寫出可解析的法規名稱與條號，無從比對。',
    },
  ];

  return (
    <div className="home">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero">
        <p className="hero-eyebrow">{meta.exam.commissioner} 委託辦理</p>
        <h1>票券商業務人員 專業科目測驗</h1>
        <div className="hero-figures">
          <span className="hero-fig">
            <b>{stats.total.toLocaleString()}</b>
            <small>練習題</small>
          </span>
          <span className="hero-fig">
            <b>{stats.withLawText}</b>
            <small>題附現行法條原文</small>
          </span>
        </div>
      </section>

      {/* ── 考試規則 ──────────────────────────────────────── */}
      <section className="card">
        <h2>考試規則</h2>

        <div className="spec-grid">
          {meta.exam.subjects.map((s, i) => (
            <div className="spec" key={s.name}>
              <span className="spec-node">第 {i + 1} 節</span>
              <strong>{s.name}</strong>
              <span className="spec-meta">
                {s.questions} 題 · {s.minutes} 分鐘 · 滿分 {s.full_marks}
              </span>
            </div>
          ))}
        </div>

        <div className="rule-callout">
          <span className="rule-icon" aria-hidden>
            ✓
          </span>
          <div>
            <strong>合格標準</strong>
            <p>
              兩科總分合計達 <b>{PASS_TOTAL}</b> 分，
              <em>且任一科不得低於 {PASS_PER_SUBJECT} 分</em>
            </p>
            <small>
              兩個條件都要滿足。法規 95 ＋ 實務 55 ＝ 150 分，總分雖過 140，
              實務未達 60 仍不合格。
            </small>
          </div>
        </div>

        <dl className="kv">
          <dt>報名費</dt>
          <dd>NT$ {meta.exam.fee_twd.toLocaleString()}</dd>
          <dt>執行單位</dt>
          <dd>{meta.exam.administrator}</dd>
          <dt>法源</dt>
          <dd>{meta.exam.legal_basis}</dd>
        </dl>

        <p className="note">
          依官方簡章 {meta.exam.brochure_version} 版。網路上常見「實務 80 題／90 分鐘」
          「任一科低於 70 分不合格」的說法為過時或錯誤資訊。
        </p>
      </section>

      {/* ── 開始練習 ──────────────────────────────────────── */}
      <section className="card">
        <h2>開始練習</h2>

        <fieldset className="field">
          <legend>模式</legend>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mode-btn ${mode === m.id ? 'on' : ''}`}
                aria-pressed={mode === m.id}
                onClick={() => setMode(m.id)}
              >
                <strong>{m.label}</strong>
                <small>{m.hint(wrongCount)}</small>
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
                    aria-pressed={subject === s}
                    onClick={() => setSubject(s)}
                  >
                    {s === 'all' ? '兩科合併' : s}
                    <small>{s === 'all' ? `${stats.total} 題` : `${stats.bySubject[s]} 題`}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="field">
              <legend>題數</legend>
              <div className="seg seg-tight">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`seg-btn ${count === n ? 'on' : ''}`}
                    aria-pressed={count === n}
                    onClick={() => setCount(n)}
                  >
                    {n}
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
                  aria-pressed={tags.includes(t)}
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
              aria-pressed={officialOnly}
              onClick={() => setOfficialOnly((v) => !v)}
              title="只出票券公會官方釋出的 480 題參考題庫"
            >
              只用官方題庫
            </button>
          </div>
          {mode === 'mock' ? (
            <p className="note">
              模擬考不套用標籤篩選，以維持與正式測驗相同的出題結構
              （兩科各 {MOCK_PER_SUBJECT} 題）。
            </p>
          ) : (
            <p className="note">
              符合條件 <strong>{available.toLocaleString()}</strong> 題
              {/*
                題庫題數與「兩科合併」的可抽題池會差幾題 —— 官方題庫本身
                就有同一題同時收在兩科的情形（法規 #174 與實務 #416），
                資料層兩份都留（只練一科的人不該少一題），合併時只出一次。
                數量由兩者相減推導，不寫死 —— 資料換版時這行必須跟著變。
              */}
              {available < stats.total && subject === 'all' && tags.length === 0 && !officialOnly && (
                <>（有 {stats.total - available} 組題目同時收錄於兩科，合併練習時只出一次）</>
              )}
              {mode === 'practice' && available < count && available > 0 && (
                <>，不足 {count} 題，將出 {available} 題</>
              )}
            </p>
          )}
        </fieldset>

        <div className="actions">
          <button
            type="button"
            className="btn-primary btn-lg"
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

      {/* ── 資料來源 ──────────────────────────────────────── */}
      <section className="card">
        <h2>資料來源</h2>

        <h3>引用法條稽核</h3>
        <p className="note">
          以 {audit.corpus.laws} 部法規（{audit.corpus.articles} 條，擷取自
          {audit.corpus.source}，{audit.corpus.retrieved_at}）比對每題解析引用的條號。
        </p>
        <AuditBar slices={auditSlices} total={stats.total} />

        <h3>題庫出處</h3>
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.source_id}>
              <div className="source-head">
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
                <span
                  className={`badge ${
                    s.authority === 'official' ? 'badge-official' : 'badge-community'
                  }`}
                >
                  {s.authority === 'official' ? '官方' : '社群'}
                </span>
              </div>
              <small>
                {s.publisher} · {s.note}
              </small>
            </li>
          ))}
        </ul>
      </section>

      <footer className="site-foot">
        <p>
          本工具為非官方備考練習資源，與中華民國票券金融商業同業公會、
          證券暨期貨市場發展基金會均無隸屬關係。
          考試規則以官方簡章為準；法規以全國法規資料庫現行條文為準。
        </p>
      </footer>
    </div>
  );
}
