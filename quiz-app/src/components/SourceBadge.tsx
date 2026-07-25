import type { LawCitation, Provenance } from '../types/quiz';

/**
 * 來源徽章。
 *
 * 使用者有權在**作答的當下**就知道這一題的答案是誰說的：
 * 是測驗委託單位（票券公會）釋出的官方參考題庫，還是不具名考生的網路彙整。
 * 兩者的可信度差很多，把它藏起來等於讓人把後者當前者用。
 */
export function SourceBadge({ provenance }: { provenance: Provenance }) {
  const official = provenance.source_type === 'official_association_bank';
  return (
    <span
      className={`badge ${official ? 'badge-official' : 'badge-community'}`}
      title={
        official
          ? '中華民國票券金融商業同業公會公開釋出之參考題庫'
          : '不具名考生社群整理之考古題彙編；來源檔自述含有少數錯誤，請以法規為準'
      }
    >
      {official ? '官方公會題庫' : '社群考古題'}
      {provenance.original_no ? ` #${provenance.original_no}` : ''}
    </span>
  );
}

const CITATION_LABEL: Record<string, { text: string; cls: string; title: string }> = {
  verified_article_exists: {
    text: '引用條文現行有效',
    cls: 'badge-ok',
    title: '解析引用的條號在現行條文中仍然存在。注意：這不代表本題答案正確。',
  },
  verified_content_match: {
    text: '引述內容現行有效',
    cls: 'badge-ok',
    title: '該文件現行版無條號編制，已確認解析引述的內容仍在現行文件中。注意：這不代表本題答案正確。',
  },
  content_not_found: {
    text: '⚠ 引述內容已不在現行文件',
    cls: 'badge-warn',
    title: '解析引述的規定在現行文件中找不到，可能已刪除或修正，本題有過時風險。',
  },
  article_not_found: {
    text: '⚠ 引用條號已不存在',
    cls: 'badge-warn',
    title: '解析引用的條號在現行條文中找不到，可能已刪除或重新編號，本題有過時風險。',
  },
  indeterminate: {
    text: '引用狀態不明',
    cls: 'badge-neutral',
    title: '本工具對該法規的條文抽取不完整，無法判定，故不下結論。',
  },
  law_outside_corpus: {
    text: '引用他法（未查證）',
    cls: 'badge-neutral',
    title: '引用的法規不在本工具的法規語料庫內（例如銀行法、中央銀行法），未進行檢查。',
  },
  cited_document_not_in_corpus: {
    text: '引用函令／自律規範（未查證）',
    cls: 'badge-neutral',
    title: '引用的是語料庫未收錄的函令、準則或自律規範，未進行檢查。',
  },
};

export function CitationBadge({ citation }: { citation: LawCitation }) {
  const label = CITATION_LABEL[citation.status];
  if (!label) return null;
  return (
    <span className={`badge ${label.cls}`} title={label.title}>
      {label.text}
    </span>
  );
}
