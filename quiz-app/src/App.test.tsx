/**
 * 整合測試：把整個 App 掛起來跑完一遍。
 *
 * 單元測試各自測片段 —— hook 測邏輯、component 測渲染 —— 但沒有任何一支
 * 證明過「把它們接起來真的能用」。頁面切換、hook 與 UI 的接線、
 * StrictMode 下的重複渲染，全都只在這一層才會暴露。
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

function renderApp() {
  // 刻意包 StrictMode —— main.tsx 就是這樣掛的。
  // StrictMode 會重複呼叫 render 與 state updater，副作用放錯位置會在這裡現形。
  return render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

/** 點掉第一題的第一個選項，回傳該按鈕 */
async function answerFirstOption(user: ReturnType<typeof userEvent.setup>) {
  const radios = screen.getAllByRole('radio');
  await user.click(radios[0]!);
}

beforeEach(() => {
  localStorage.clear();
});

describe('首頁', () => {
  it('渲染考試規則，且與官方簡章一致', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /票券商業務人員 專業科目測驗/ })).toBeInTheDocument();
    // 及格規則是這個工具最不能寫錯的一件事
    expect(screen.getByText(/兩科總分合計達/)).toBeInTheDocument();
    expect(screen.getByText(/任一科不得低於/)).toBeInTheDocument();
  });

  it('揭露「答案未經逐條核對」，不把限制藏起來', () => {
    renderApp();
    expect(screen.getByText(/沒有任何一題的答案經過逐條核對/)).toBeInTheDocument();
  });

  it('顯示題庫來源組成', () => {
    renderApp();
    expect(screen.getByText('官方公會題庫')).toBeInTheDocument();
    expect(screen.getByText('社群考古題')).toBeInTheDocument();
  });
});

describe('練習模式完整流程', () => {
  it('開始 → 作答 → 揭曉答案 → 交卷 → 結果頁', async () => {
    const user = userEvent.setup();
    renderApp();

    // 選 10 題，開始
    await user.click(screen.getByRole('button', { name: '10' }));
    await user.click(screen.getByRole('button', { name: /開始練習/ }));

    // 測驗頁：應該有題目與 4 個選項
    expect(screen.getByText(/已答 0 \/ 10/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(2);

    // 作答前不得洩漏正解
    expect(screen.queryByText(/^正解：/)).not.toBeInTheDocument();

    await answerFirstOption(user);

    // 練習模式作答後立即揭曉
    expect(screen.getByText(/正解：/)).toBeInTheDocument();
    expect(screen.getByText(/已答 1 \/ 10/)).toBeInTheDocument();

    // 交卷
    await user.click(screen.getByRole('button', { name: /提前交卷/ }));

    // 結果頁：練習模式不得出現「合格／不合格」判定
    expect(screen.getByRole('heading', { name: '練習完成' })).toBeInTheDocument();
    expect(screen.queryByText(/模擬結果/)).not.toBeInTheDocument();
    expect(screen.getByText(/練習模式不套用官方及格標準/)).toBeInTheDocument();

    // 未作答的 9 題必須計入分母，不能只算按過的那 1 題
    expect(screen.getByText(/未作答 9 題/)).toBeInTheDocument();
  });

  it('答錯的題會進錯題本，回首頁後可以複習', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: '10' }));
    await user.click(screen.getByRole('button', { name: /開始練習/ }));

    // 作答前不得有正解字樣（queryByText 找不到回 null，getByText 會 throw）
    expect(screen.queryByText(/正解：/)).toBeNull();
    const radios = screen.getAllByRole('radio');
    await user.click(radios[radios.length - 1]!);

    await user.click(screen.getByRole('button', { name: /提前交卷/ }));
    // Header 與結果頁各有一個「回首頁」；取結果頁那顆（最後一個）
    const homeButtons = screen.getAllByRole('button', { name: '回首頁' });
    await user.click(homeButtons[homeButtons.length - 1]!);

    // 錯題本應該不是 0（10 題只答 1 題，其餘 9 題跳過也算錯）
    await user.click(screen.getByRole('button', { name: /錯題複習/ }));
    expect(screen.queryByText('目前有 0 題')).not.toBeInTheDocument();
  });
});

describe('模擬考', () => {
  it('出 100 題、分節顯示、作答中不揭曉答案，交卷後給官方及格判定', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: /模擬考/ }));
    await user.click(screen.getByRole('button', { name: /開始模擬考/ }));

    expect(screen.getByText(/已答 0 \/ 100/)).toBeInTheDocument();
    // 第一節是票券金融法規，且應顯示倒數計時
    expect(screen.getByText(/票券金融法規 ·/)).toBeInTheDocument();

    await answerFirstOption(user);

    // 模擬考作答後**不得**揭曉答案 —— 揭曉了整場模擬就沒有意義
    expect(screen.queryByText(/正解：/)).not.toBeInTheDocument();
    expect(screen.getByText(/已答 1 \/ 100/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /提前交卷/ }));

    // 結果頁：必須給出官方及格判定與兩科成績
    expect(screen.getByRole('heading', { name: /模擬結果/ })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('票券金融法規')).toBeInTheDocument();
    expect(within(table).getByText('票券金融實務')).toBeInTheDocument();
  });

  it('模擬考不顯示標籤篩選（16 題的「合格」沒有意義）', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByRole('button', { name: '計算題' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /模擬考/ }));
    expect(screen.queryByRole('button', { name: '計算題' })).not.toBeInTheDocument();
    expect(screen.getByText(/模擬考不套用標籤篩選/)).toBeInTheDocument();
  });
});

describe('無障礙設定', () => {
  it('主題切換會寫到 <html> 並在重新掛載後保留', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();

    await user.click(screen.getByRole('button', { name: /主題/ }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    unmount();
    renderApp();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('字級設定會套用到 <html>', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.selectOptions(screen.getByLabelText('字級'), 'xlarge');
    expect(document.documentElement.getAttribute('data-font-size')).toBe('xlarge');
  });
});
