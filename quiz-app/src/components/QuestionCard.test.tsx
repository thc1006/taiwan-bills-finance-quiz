import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionCard } from './QuestionCard';
import type { QuizQuestion } from '../types/quiz';

const base: QuizQuestion = {
  id: 'tbfa-001',
  stem: '下列何者非屬票券金融公司得經營之業務項目？',
  options: [
    { key: 'A', text: '短期票券之簽證、承銷業務' },
    { key: 'B', text: '金融債券之簽證、承銷業務' },
    { key: 'C', text: '公司債之簽證、承銷業務' },
    { key: 'D', text: '政府債券之經紀、自營業務' },
  ],
  answer: 'C',
  explanation: '票券金融管理法第21條',
  subject: '票券金融法規',
  source_id: 'tbfa-official-bank',
  provenance: { source_type: 'official_association_bank', original_no: 1 },
  tags: [],
  law_citation: {
    status: 'verified_article_exists',
    law: '票券金融管理法',
    article: '21',
    current_text: '票券金融公司得經營之業務項目，由主管機關……',
    source_url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0380146',
  },
};

const community: QuizQuestion = {
  ...base,
  id: 'comm-0001',
  provenance: { source_type: 'community_compilation', original_no: 5 },
  law_citation: { status: 'no_citation' },
  explanation: '',
};

function setup(q: QuizQuestion, revealed: boolean, selected: 'A' | 'B' | 'C' | 'D' | null | undefined) {
  const onSelect = vi.fn();
  render(
    <QuestionCard
      question={q}
      index={0}
      total={10}
      selected={selected}
      revealed={revealed}
      onSelect={onSelect}
    />
  );
  return { onSelect };
}

describe('QuestionCard 未揭曉時', () => {
  it('顯示題幹與所有選項', () => {
    setup(base, false, undefined);
    expect(screen.getByText(base.stem)).toBeInTheDocument();
    for (const o of base.options) {
      expect(screen.getByText(o.text)).toBeInTheDocument();
    }
  });

  /** 作答中洩漏答案等於整個測驗失去意義 —— 這是最重要的一條。 */
  it('不洩漏正解、不顯示解析與法條', () => {
    setup(base, false, undefined);
    expect(screen.queryByText(/正解/)).not.toBeInTheDocument();
    expect(screen.queryByText(/票券金融管理法第21條/)).not.toBeInTheDocument();
    expect(screen.queryByText(/現行條文對照/)).not.toBeInTheDocument();
  });

  it('點選選項會回呼對應的 key', async () => {
    const { onSelect } = setup(base, false, undefined);
    await userEvent.click(screen.getByText('公司債之簽證、承銷業務'));
    expect(onSelect).toHaveBeenCalledWith('C');
  });

  it('選項未被 aria-checked 誤標', () => {
    setup(base, false, undefined);
    for (const r of screen.getAllByRole('radio')) {
      expect(r).toHaveAttribute('aria-checked', 'false');
    }
  });
});

describe('QuestionCard 已作答', () => {
  it('作答後選項被鎖定，無法改答案', async () => {
    const { onSelect } = setup(base, true, 'A');
    await userEvent.click(screen.getByText('政府債券之經紀、自營業務'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('揭曉後顯示正解、解析與現行條文', () => {
    setup(base, true, 'A');
    expect(screen.getByText(/正解/)).toBeInTheDocument();
    expect(screen.getByText('票券金融管理法第21條')).toBeInTheDocument();
    expect(screen.getByText(/現行條文對照/)).toBeInTheDocument();
    // 題幹與法條原文都含這串字，必須指定容器才不會誤判
    expect(document.querySelector('.law-text')?.textContent).toContain(
      '票券金融公司得經營之業務項目'
    );
  });

  it('未作答（跳過）時明確標示', () => {
    setup(base, true, null);
    expect(screen.getByText(/本題未作答/)).toBeInTheDocument();
  });
});

describe('來源揭露', () => {
  it('官方題庫顯示官方徽章', () => {
    setup(base, false, undefined);
    expect(screen.getByText(/官方公會題庫/)).toBeInTheDocument();
  });

  it('社群題目顯示社群徽章與可信度警語', () => {
    setup(community, true, 'A');
    expect(screen.getByText(/社群考古題/)).toBeInTheDocument();
    expect(screen.getByText(/未經官方認可/)).toBeInTheDocument();
  });

  it('官方題目不顯示社群警語', () => {
    setup(base, true, 'A');
    expect(screen.queryByText(/未經官方認可/)).not.toBeInTheDocument();
  });

  it('沒有解析時誠實說明，而不是留白', () => {
    setup(community, true, 'A');
    expect(screen.getByText(/來源檔未附解析/)).toBeInTheDocument();
  });

  it('無法條引用時不渲染條文區塊', () => {
    setup(community, true, 'A');
    expect(screen.queryByText(/現行條文對照/)).not.toBeInTheDocument();
  });
});
