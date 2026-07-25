import type { LawCitation } from '../types/quiz';

/**
 * 現行法條原文。
 *
 * 這是本工具與「純題庫 app」的關鍵差別：官方公會題庫釋出年代較久，
 * 解析寫的可能是舊法。與其要使用者背一段不知道還算不算數的解析，
 * 不如把**現行條文**直接擺在旁邊 —— 條文是唯一的權威，解析只是轉述。
 *
 * 條文擷取自全國法規資料庫（2026-07-25），節錄至 420 字並附原始連結。
 */
export function LawArticle({ citation }: { citation: LawCitation }) {
  if (citation.status !== 'verified_article_exists' || !citation.current_text) {
    return null;
  }
  return (
    <details className="law-article">
      <summary>
        📘 現行條文對照 —— {citation.law} 第 {citation.article} 條
      </summary>
      <pre className="law-text">{citation.current_text}</pre>
      <p className="law-foot">
        擷取自全國法規資料庫 2026-07-25
        {citation.source_url && (
          <>
            {' · '}
            <a href={citation.source_url} target="_blank" rel="noreferrer noopener">
              查看完整法規
            </a>
          </>
        )}
        {citation.matched_via === 'fuzzy' && citation.raw_law_name && (
          <>
            {' · '}
            <span title="來源檔寫的法規名稱與正式名稱不完全相同，由模糊比對對應">
              來源檔原寫「{citation.raw_law_name}」
            </span>
          </>
        )}
      </p>
    </details>
  );
}
