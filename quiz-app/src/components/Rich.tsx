import { Fragment } from 'react';

/**
 * 把 `**粗體**` 轉成 <strong>。
 *
 * 資料集的 meta 說明是在 Python 端寫的，那邊自然會用 Markdown 語法標重點。
 * React 不會解讀 Markdown，直接 {text} 出去會讓使用者看到滿畫面的星號 ——
 * 而這些字串偏偏是整個工具最需要被讀懂的部分（「**沒有任何一題**的答案經過核對」）。
 *
 * 這裡刻意只支援 `**` 一種語法：不引入 Markdown 套件、不允許 HTML，
 * 所以沒有 XSS 面，也不會有人把整篇文章塞進 note 欄位。
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split('**');

  // 成對的 ** 會切出奇數個片段（"a**b**c" → 3）。切出偶數個代表有落單的 **，
  // 這時**不猜**：直接原樣輸出整段。
  //
  // 天真的做法是照樣把奇數索引變粗體 —— 那會做兩件錯事：把落單的 ** 字元
  // 吃掉，並且讓後面整段變粗體。與其猜作者的意圖，不如原樣呈現，
  // 讓寫錯的人看得到自己寫錯了。
  if (parts.length % 2 === 0) return <>{text}</>;

  // 奇數索引即為粗體區段。
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i}>{part}</strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}
