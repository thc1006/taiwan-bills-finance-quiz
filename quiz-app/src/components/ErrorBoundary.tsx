import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * 全域錯誤邊界。
 *
 * 沒有它的話，任何一個 render 例外都會讓畫面整片空白 —— 使用者不會知道
 * 發生什麼事，也不知道能不能重來。這裡至少要讓人看得到錯誤並能重新開始。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[taiwan-bills-finance-quiz] render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-box" role="alert">
          <h1>發生錯誤</h1>
          <p>應用程式遇到未預期的問題，你的錯題紀錄仍保存在瀏覽器中。</p>
          <pre>{this.state.error.message}</pre>
          <button type="button" onClick={() => window.location.reload()}>
            重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
