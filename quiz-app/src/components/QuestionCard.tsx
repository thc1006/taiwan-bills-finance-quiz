import type { QuizQuestion } from '../types/quiz';
import { CitationBadge, SourceBadge } from './SourceBadge';
import { LawArticle } from './LawArticle';

export interface QuestionCardProps {
  question: QuizQuestion;
  index: number;
  total: number;
  /** 已選的答案；null 代表跳過、undefined 代表尚未作答 */
  selected: 'A' | 'B' | 'C' | 'D' | null | undefined;
  /** 是否揭曉答案（練習模式作答後 true；模擬考作答中恆 false） */
  revealed: boolean;
  onSelect: (key: 'A' | 'B' | 'C' | 'D') => void;
}

export function QuestionCard({
  question,
  index,
  total,
  selected,
  revealed,
  onSelect,
}: QuestionCardProps) {
  const answered = selected !== undefined;

  return (
    <article className="question-card" aria-label={`第 ${index + 1} 題，共 ${total} 題`}>
      <header className="q-head">
        <span className="q-index">
          {index + 1} / {total}
        </span>
        <span className="badge badge-subject">{question.subject}</span>
        <SourceBadge provenance={question.provenance} />
        {question.tags.map((t) => (
          <span key={t} className="badge badge-tag">
            {t}
          </span>
        ))}
        {revealed && <CitationBadge citation={question.law_citation} />}
      </header>

      <h2 className="q-stem">{question.stem}</h2>

      <ul className="q-options" role="radiogroup" aria-label="選項">
        {question.options.map((opt) => {
          const isAnswer = opt.key === question.answer;
          const isPicked = opt.key === selected;
          const cls = revealed
            ? isAnswer
              ? 'opt opt-right'
              : isPicked
                ? 'opt opt-wrong'
                : 'opt'
            : isPicked
              ? 'opt opt-picked'
              : 'opt';
          return (
            // role="presentation" 移除 <li> 的隱含 listitem 角色 ——
            // radiogroup 的子節點只能是 radio，中間夾一個 listitem 會讓
            // 螢幕閱讀器算不出「第幾個、共幾個選項」。
            <li key={opt.key} role="presentation">
              <button
                type="button"
                className={cls}
                role="radio"
                aria-checked={isPicked}
                // 作答後鎖定該題：正式測驗不能改答案，而且允許改會讓
                // 「錯題本」記錄的對錯失去意義。
                disabled={answered}
                onClick={() => onSelect(opt.key)}
              >
                <span className="opt-key">{opt.key}</span>
                <span className="opt-text">{opt.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {revealed && (
        <div className="q-reveal">
          <p className="q-answer">
            正解：<strong>{question.answer}</strong>
            {selected === null && <span className="q-skipped">（本題未作答）</span>}
          </p>
          {question.explanation ? (
            <p className="q-explanation">{question.explanation}</p>
          ) : (
            <p className="q-explanation q-muted">此題來源檔未附解析。</p>
          )}
          <LawArticle citation={question.law_citation} />
          {question.provenance.source_type === 'community_compilation' && (
            <p className="q-caveat">
              本題來自社群整理的考古題彙編，答案未經官方認可；若與現行法條牴觸，請以法條為準。
            </p>
          )}
        </div>
      )}
    </article>
  );
}
