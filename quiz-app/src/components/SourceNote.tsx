import type { QuizQuestion } from '../types/quiz';
import { sources } from '../data/questions';

/**
 * 這一題的出處，附在答案底下。
 *
 * 出處資訊從首頁移到這裡是刻意的：首頁列一份總表，讀的人不會把它跟
 * 手上這一題連起來 —— 而「這個答案是誰說的」只有在看到答案的那一刻才有意義。
 * 放在答案正下方，使用者不必記得首頁寫過什麼，也不必自己對應。
 */
export function SourceNote({ question }: { question: QuizQuestion }) {
  const src = sources.find((s) => s.source_id === question.source_id);
  if (!src) return null;

  const official = src.authority === 'official';
  return (
    <p className="q-source">
      <span className="q-source-label">出處</span>
      <a href={src.url} target="_blank" rel="noreferrer noopener">
        {src.title}
      </a>
      <span className={`badge ${official ? 'badge-official' : 'badge-community'}`}>
        {official ? '官方' : '社群'}
      </span>
      <span className="q-source-pub">{src.publisher}</span>
    </p>
  );
}
