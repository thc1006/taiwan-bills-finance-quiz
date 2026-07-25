#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
擷取不在全國法規資料庫的被引用文件（金管會令、公會自律規範、PDF 公告等）。

為什麼需要這支：`fetch_laws.py` 只處理全國法規資料庫。但題目也會引用
金管會的「令」與「規定」、票券公會的自律規範與準則、央行要點 ——
這些不在 MOJ，卻同樣是題目答案的依據。不收錄就只能標「未查證」，
而「未查證」愈多，這個工具能給使用者的保證就愈少。

支援來源：
  - 金管會主管法規共用系統  law.fsc.gov.tw/LawContent.aspx?id=...
  - 植根法律網              rootlaw.com.tw/LawArticle.aspx?LawID=...
  - 任意 PDF（銀行局、票券公會等）

編號正規化：
  這類文件多以「一、二、三、」編點而非「第 N 條」，但題目解析一律寫成
  「第 N 條」。因此存檔時統一轉成「第 N 條」標題，並在檔頭註明原文用「點」。
"""
from __future__ import annotations

import io
import os
import re
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
COLLECTION = os.path.dirname(REPO)
LAW_DIR = os.path.join(COLLECTION, "04_法規彙編")

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

CN = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
      "八": 8, "九": 9, "十": 10}


def cn_num(w: str) -> int | None:
    if not w or any(c not in CN for c in w):
        return None
    if w.startswith("十"):
        return 10 + (CN[w[1]] if len(w) > 1 else 0)
    if "十" in w:
        a, _, b = w.partition("十")
        return CN[a] * 10 + (CN[b] if b else 0)
    return CN[w] if len(w) == 1 else None


def fetch(url: str) -> tuple[bytes, str]:
    r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90)
    return r.read(), r.headers.get("Content-Type", "")


def html_to_text(raw: bytes) -> str:
    try:
        h = raw.decode("utf-8")
    except UnicodeDecodeError:
        h = raw.decode("big5", "replace")
    h = re.sub(r"(?s)<script.*?</script>", "", h)
    h = re.sub(r"(?s)<style.*?</style>", "", h)
    h = re.sub(r"<br\s*/?>", "\n", h)
    h = re.sub(r"</(p|div|tr|li|td)>", "\n", h)
    h = re.sub(r"<[^>]+>", "", h)
    for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                 ("&quot;", '"'), ("&#39;", "'")]:
        h = h.replace(a, b)
    h = re.sub(r"[ \t　]+", " ", h)
    return re.sub(r"\n{3,}", "\n\n", h).strip()


def pdf_to_text(raw: bytes) -> str:
    from pypdf import PdfReader

    r = PdfReader(io.BytesIO(raw))
    return "\n".join((p.extract_text() or "") for p in r.pages)


def extract_body(text: str) -> str:
    """從整頁文字中切出條文本體。

    起點：第一個「一、」或「第一條/第 1 條」；終點：出現頁尾雜訊或文末。
    """
    m = re.search(r"^\s*(?:一、|第\s*[0-9一]\s*條|第一點)", text, re.M)
    start = m.start() if m else 0
    tail = re.search(r"(回上一頁|相關法條|附件下載|瀏覽人次|版權所有|Copyright)", text[start:])
    end = start + tail.start() if tail else len(text)
    return text[start:end].strip()


def normalize_points(body: str) -> tuple[str, bool]:
    """把「一、二、三、」的點編號轉為「第 N 條」標題。

    題目解析一律寫「第 N 條」，語料庫的鍵也是條號 —— 不轉的話，
    這份文件在比對時等於一條都沒有，引用它的題目只能標「未查證」。
    """
    lines = body.split("\n")
    out, converted = [], False
    for ln in lines:
        m = re.match(r"^\s*([一二三四五六七八九十]+)、\s*(.*)$", ln)
        if m and cn_num(m.group(1)) is not None:
            n = cn_num(m.group(1))
            out.append(f"第 {n} 條")
            out.append("")
            if m.group(2).strip():
                out.append(m.group(2).strip())
            converted = True
        else:
            out.append(ln)
    return "\n".join(out), converted


def save(name: str, url: str, body: str, note: str) -> str:
    idx = 1 + max(
        (int(m.group(1)) for f in os.listdir(LAW_DIR) if (m := re.match(r"^(\d+)_", f))),
        default=0,
    )
    safe = re.sub(r'[\\/:*?"<>|]', "_", name)
    path = os.path.join(LAW_DIR, f"{idx:02d}_{safe}.md")
    open(path, "w", encoding="utf-8").write(
        f"# {name}\n\n來源：全國法規資料庫 {url}\n最新修正：見來源\n"
        f"擷取日期：2026-07-25\n{note}\n\n---\n\n{body}\n"
    )
    return path


def main(argv: list[str]) -> int:
    # 參數成對：名稱 網址 名稱 網址 …
    args = argv[1:]
    if not args or len(args) % 2:
        print("用法：python tools/fetch_docs.py <名稱> <網址> [<名稱> <網址>…]", file=sys.stderr)
        return 2

    ok = miss = 0
    for i in range(0, len(args), 2):
        name, url = args[i], args[i + 1]
        try:
            raw, ct = fetch(url)
            text = pdf_to_text(raw) if (b"%PDF" == raw[:4] or "pdf" in ct.lower()) else html_to_text(raw)
            body = extract_body(text)
            if len(body) < 120:
                print(f"  ✗ {name}：抽取到的條文過短（{len(body)} 字）")
                miss += 1
                continue
            body, converted = normalize_points(body)
            note = (
                "說明：原文以「點」編號（一、二、三、…），此處統一轉為「第 N 條」"
                "標題以利與題目解析的引用格式比對。"
                if converted else ""
            )
            arts = len(re.findall(r"^\s*第\s*\S+\s*條\s*$", body, re.M))
            p = save(name, url, body, note)
            print(f"  ✓ {name}  ({arts} 條/點, {len(body)} 字)  -> {os.path.basename(p)}")
            ok += 1
        except Exception as e:
            print(f"  ✗ {name}：{str(e)[:80]}")
            miss += 1
    print(f"\n成功 {ok}，失敗 {miss}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
