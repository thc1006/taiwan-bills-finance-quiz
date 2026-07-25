#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
擷取不在全國法規資料庫的被引用文件（金管會令、公會自律規範、央行要點、PDF 公告）。

為什麼需要這支：`fetch_laws.py` 只處理全國法規資料庫。但題目也會引用
金管會的「令」與「規定」、票券公會的自律規範與準則、央行作業要點 ——
這些不在 MOJ，卻同樣是題目答案的依據。不收錄就只能標「未查證」，
而「未查證」愈多，這個工具能給使用者的保證就愈少。

支援來源與格式：
  - HTML：金管會主管法規共用系統、中央銀行法令規章查詢系統、植根法律網
  - PDF ：銀行局、法務部調查局等
  - .doc：票券公會（Word 97-2003 二進位）

兩道防線：
  1. **標題驗證** —— 抓到的必須真的是要的那份文件（見 main() 的說明）
  2. **編號正規化** —— 這類文件多以「一、二、三、」編點而非「第 N 條」，
     但題目解析一律寫「第 N 條」，因此存檔時統一轉換
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

# .doc 抽取後要保留的字元：中日韓、全形標點、英數與換行
KEEP_RE = "[^" "一-鿿" "　-〿" "0-9A-Za-z" "，。、：；（）「」％" "%.\\-\r\n" "]"

CN = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
      "八": 8, "九": 9, "十": 10}


def norm(s: str) -> str:
    return re.sub(r"[\s　「」『』（）()、,，之]", "", s).replace("臺", "台")


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


def unescape_all(h: str) -> str:
    """反覆解實體，直到不再變化。

    央行的頁面把中文做了**雙重**編碼（`&amp;#x4E2D;`），只解一次會留下
    `&#x4E2D;` 這種殘留 —— 條文讀起來是一串實體參照，標題比對也會失敗。
    """
    import html as _html

    for _ in range(4):
        n = _html.unescape(h)
        if n == h:
            return h
        h = n
    return h


def decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("big5", "replace")


def html_to_text(raw: bytes) -> str:
    h = decode(raw)
    h = re.sub(r"(?s)<script.*?</script>", "", h)
    h = re.sub(r"(?s)<style.*?</style>", "", h)
    h = re.sub(r"<br\s*/?>", "\n", h)
    h = re.sub(r"</(p|div|tr|li|td)>", "\n", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = unescape_all(h).replace("\xa0", " ")
    h = re.sub(r"[ \t　]+", " ", h)
    return re.sub(r"\n{3,}", "\n\n", h).strip()


def doc_to_text(raw: bytes) -> str:
    """Word 97-2003（OLE2 複合文件）的文字抽取。

    python-docx 只吃 .docx，環境裡也沒有 antiword／LibreOffice。
    Word 97 把內文以 UTF-16LE 存在 WordDocument 串流裡，直接解碼再濾掉
    非文字位元組即可 —— 對純條文文件夠用，不需要完整的 .doc 解析器。
    """
    import olefile

    ole = olefile.OleFileIO(io.BytesIO(raw))
    txt = ole.openstream("WordDocument").read().decode("utf-16-le", "ignore")
    txt = re.sub(KEEP_RE, "", txt).replace("\r", "\n")
    return re.sub(r"\n{3,}", "\n\n", txt).strip()


def pdf_to_text(raw: bytes) -> str:
    from pypdf import PdfReader

    r = PdfReader(io.BytesIO(raw))
    return "\n".join((p.extract_text() or "") for p in r.pages)


def page_titles(raw: bytes, text: str) -> list[str]:
    """蒐集頁面上所有可能是「文件自己的名稱」的候選字串。

    回傳 list 而非單一值，是因為不同來源把名稱放在不同地方，而且常有干擾：
      - 金管會：<title>…-法規內容-XXX</title>
      - 植根：  <title>XXX</title>
      - 央行列印頁：<title>列印</title>（沒用），真正的名稱在頁面的「名稱：」欄位
    只取一個候選就會被「列印」擋掉；改成任一候選相符即通過。
    """
    h = unescape_all(decode(raw))
    out: list[str] = []
    m = re.search(r"<title>([^<]+)</title>", h)
    if m:
        t = m.group(1).strip()
        t = re.sub(r"^.*?法規內容[-－]", "", t)
        t = re.sub(r"[-－]全國法規資料庫.*$", "", t).strip()
        if len(t) >= 4:
            out.append(t)
    for m in re.finditer(r"名稱[：:]\s*([^\n<]{4,60})", text):
        out.append(m.group(1).strip())
    for m in re.finditer(
        r"^\s*([一-鿿]{6,40}(?:要點|辦法|規則|準則|規範|注意事項|標準|規定))\s*$", text, re.M
    ):
        out.append(m.group(1))
    return out


def extract_body(text: str) -> str:
    """從整頁文字中切出條文本體。

    起點：第一個「一、」「第 N 條」「第一點」或「壹、」——
    最後一種是章節式文件（如票券公會的徵信準則）用的，
    它們沒有條號編制，內容直接掛在章底下。
    """
    m = re.search(r"^\s*(?:一、|第\s*[0-9一]\s*條|第一點|壹、)", text, re.M)
    start = m.start() if m else 0
    tail = re.search(r"(回上一頁|相關法條|附件下載|瀏覽人次|版權所有|Copyright)", text[start:])
    end = start + tail.start() if tail else len(text)
    return text[start:end].strip()


def normalize_points(body: str) -> tuple[str, bool]:
    """把「一、二、三、」的點編號轉為「第 N 條」標題。

    題目解析一律寫「第 N 條」，語料庫的鍵也是條號 —— 不轉的話，
    這份文件在比對時等於一條都沒有，引用它的題目只能標「未查證」。
    """
    out, converted = [], False
    for ln in body.split("\n"):
        m = re.match(r"^\s*([一二三四五六七八九十]+)、\s*(.*)$", ln)
        if m and cn_num(m.group(1)) is not None:
            out.append(f"第 {cn_num(m.group(1))} 條")
            out.append("")
            if m.group(2).strip():
                out.append(m.group(2).strip())
            converted = True
        else:
            out.append(ln)
    return "\n".join(out), converted


SOURCE_NAME = [
    ("law.moj.gov.tw", "全國法規資料庫"),
    ("law.fsc.gov.tw", "金融監督管理委員會主管法規共用系統"),
    ("law.cbc.gov.tw", "中央銀行法令規章查詢系統"),
    ("law.banking.gov.tw", "金管會銀行局金融法規全文檢索"),
    ("rootlaw.com.tw", "植根法律網"),
    ("tbfa.org.tw", "中華民國票券金融商業同業公會"),
    ("mjib.gov.tw", "法務部調查局"),
]


def source_label(url: str) -> str:
    """依網域標出真正的來源。

    原本一律寫「來源：全國法規資料庫」—— 但央行要點、金管會令、公會自律規範
    都不在那裡。把來源標錯，等於在溯源文件上說謊，而溯源正是這個專案的核心。
    """
    for host, label in SOURCE_NAME:
        if host in url:
            return label
    return "來源網站"


def save(name: str, url: str, body: str, note: str) -> str:
    idx = 1 + max(
        (int(m.group(1)) for f in os.listdir(LAW_DIR) if (m := re.match(r"^(\d+)_", f))),
        default=0,
    )
    safe = re.sub(r'[\\/:*?"<>|]', "_", name)
    path = os.path.join(LAW_DIR, f"{idx:02d}_{safe}.md")
    open(path, "w", encoding="utf-8").write(
        f"# {name}\n\n來源：{source_label(url)} {url}\n最新修正：見來源\n"
        f"擷取日期：2026-07-26\n{note}\n\n---\n\n{body}\n"
    )
    return path


def main(argv: list[str]) -> int:
    args = argv[1:]
    if not args or len(args) % 2:
        print("用法：python tools/fetch_docs.py <名稱> <網址> [<名稱> <網址>…]", file=sys.stderr)
        return 2

    ok = miss = 0
    for i in range(0, len(args), 2):
        name, url = args[i], args[i + 1]
        try:
            raw, ct = fetch(url)
            is_pdf = raw[:4] == b"%PDF" or "pdf" in ct.lower()
            is_doc = raw[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
            text = (
                pdf_to_text(raw) if is_pdf
                else doc_to_text(raw) if is_doc
                else html_to_text(raw)
            )

            # 標題驗證：抓到的必須真的是我們要的那一份文件。
            #
            # 少了這一關，抓錯來源會**靜默**變成一份掛著錯名字的法規，
            # 然後題目會被「查證」成引用了另一部法的條文 —— 使用者看到的
            # 「現行條文對照」與題目毫不相干，卻標著「引用條文現行有效」。
            # 這正是實際發生過的事：央行的 LA06D002001 是「國庫券經售及買回
            # 作業處理要點」，卻被存成「中央銀行公開市場操作作業要點」，
            # 害 comm-0773 拿到一段講賣回投標單格式的條文當依據。
            #
            # PDF 與 .doc 沒有可靠的標題欄位，改以「內容含文件名稱」為準。
            if not is_pdf and not is_doc:
                cands = page_titles(raw, text)
                if cands and not any(norm(c) == norm(name) for c in cands):
                    shown = "、".join(dict.fromkeys(cands))[:80]
                    print(f"  ✗ {name}：來源標題不符（頁面上是「{shown}」），拒絕存檔")
                    miss += 1
                    continue
            elif norm(name)[:8] not in norm(text):
                print(f"  ✗ {name}：檔案內容找不到文件名稱，可能抓錯檔，拒絕存檔")
                miss += 1
                continue

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
