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
  // 以 ** 切開；奇數索引即為粗體區段。落單的 ** 會留在原地當作純文字，
  // 不會把後面整段吃掉。
  const parts = text.split('**');
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
