#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把題目解析所引用、但語料庫尚未收錄的法規，從全國法規資料庫抓下來。

目的：讓「引用他法／函令，未查證」歸零 —— 每一題引用的條號都要真的去比對過，
而不是標一個「未查證」就算了。

作法：
  1. 以法規名稱在全國法規資料庫搜尋，取得候選 pcode
  2. 逐一抓取候選，**比對標題是否完全相符**（搜尋結果常夾帶施行細則等近似名稱）
  3. 相符者寫入 ../04_法規彙編/，格式與既有語料庫一致

抓不到的（公會自律規範、部分金管會令與央行要點不在全國法規資料庫）會明確列出，
不會假裝有查過。
"""
from __future__ import annotations

import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
COLLECTION = os.path.dirname(REPO)
LAW_DIR = os.path.join(COLLECTION, "04_法規彙編")

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def get(url: str) -> str:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=60
    ).read().decode("utf-8", "replace")


def norm_name(s: str) -> str:
    return re.sub(r"[\s　]", "", s).replace("臺", "台")


def search_pcodes(name: str) -> list[str]:
    q = urllib.parse.quote(name)
    url = f"https://law.moj.gov.tw/Law/LawSearchResult.aspx?ty=ONEBAR&kw={q}"
    try:
        h = get(url)
    except Exception:
        return []
    seen, out = set(), []
    for p in re.findall(r"LawAll\.aspx\?pcode=([A-Z0-9]+)", h):
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out[:8]


def clean_html(s: str) -> str:
    s = re.sub(r"(?s)<script.*?</script>", "", s)
    s = re.sub(r"(?s)<style.*?</style>", "", s)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</(p|div|li|tr)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    for a, b in [("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"),
                 ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")]:
        s = s.replace(a, b)
    s = re.sub(r"[ \t　]+", " ", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def fetch_law(pcode: str) -> tuple[str, str, str] | None:
    """回傳 (法規名稱, 條文本體, 最新修正日期)"""
    url = f"https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode={pcode}"
    try:
        h = get(url)
    except Exception:
        return None
    m = re.search(r"<title>([^<]+)</title>", h)
    if not m:
        return None
    title = m.group(1).replace("-全國法規資料庫", "").strip()
    if not title or "查無" in title or "系統訊息" in title:
        return None
    # 條文區塊的抽取要三段式：
    #   1. law-reg-content 容器 —— 對多數法規有效
    #   2. 從「第 1 條」切到列印區塊 —— 容器的 </div> 邊界對長法規會提早收斂，
    #      造成抽到空片段（票據法、銀行法都踩到）
    #   3. 整頁去標籤 —— 最後手段
    # 少了第 2 步，抓不到的法規會被誤報成「不在全國法規資料庫」。
    text = ""
    body = re.search(
        r'(?s)<div[^>]*class="[^"]*law-reg-content[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</div>', h
    )
    if body:
        text = clean_html(body.group(1))
    if len(text) < 200:
        m2 = re.search(
            r'(?s)(第\s*1\s*條.*?)(?:<div[^>]*id="cbDivPrint"|</form>)', h
        )
        if m2:
            text = clean_html(m2.group(1))
    if len(text) < 200:
        text = clean_html(h)
    if len(text) < 150:
        return None
    dt = re.search(r"修正日期[^0-9]*(民國\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日)", clean_html(h))
    return title, text, (dt.group(1) if dt else "見全國法規資料庫")


ART_MAX = 420


def resolve(name: str) -> tuple[str, str, str, str] | None:
    """搜尋 + 標題比對。回傳 (pcode, 標題, 條文, 修正日)

    也接受 `G0380118` 這種直接指定 pcode 的寫法 —— 全國法規資料庫的
    站內搜尋不是每一部法規都索引得到（實測「票券金融公司年報應行記載事項準則」
    與「公開發行票券金融公司財務報告編製準則」都搜不到，但 pcode 直開就有），
    那時只能手動給 pcode。
    """
    if re.fullmatch(r"[A-Z]\d{7}", name):
        got = fetch_law(name)
        return (name, *got) if got else None

    target = norm_name(name)
    for pcode in search_pcodes(name):
        got = fetch_law(pcode)
        time.sleep(0.25)
        if not got:
            continue
        title, text, dt = got
        if norm_name(title) == target:
            return pcode, title, text, dt
    return None


def save(idx: int, pcode: str, title: str, text: str, dt: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|]', "_", title)
    path = os.path.join(LAW_DIR, f"{idx:02d}_{safe}.md")
    open(path, "w", encoding="utf-8").write(
        f"# {title}\n\n"
        f"來源：全國法規資料庫 https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode={pcode}\n"
        f"最新修正：{dt}\n"
        f"擷取日期：2026-07-25\n\n---\n\n{text}\n"
    )
    return path


def main(argv: list[str]) -> int:
    names = argv[1:]
    if not names:
        print("用法：python tools/fetch_laws.py <法規名稱> [法規名稱…]", file=sys.stderr)
        return 2

    existing = {
        re.match(r"^#\s*(.+)$", open(os.path.join(LAW_DIR, f), encoding="utf-8").readline().strip()).group(1)
        for f in os.listdir(LAW_DIR)
        if f.endswith(".md")
    }
    start = 1 + max(
        (int(m.group(1)) for f in os.listdir(LAW_DIR) if (m := re.match(r"^(\d+)_", f))),
        default=0,
    )

    ok, miss = [], []
    for i, name in enumerate(names):
        if name in existing:
            print(f"  已收錄，略過：{name}")
            continue
        got = resolve(name)
        if got:
            pcode, title, text, dt = got
            p = save(start + len(ok), pcode, title, text, dt)
            arts = len(re.findall(r"^\s*(?:本條文有(?:附件|附表|圖表)\s*)?第\s*\S+\s*條\s*$", text, re.M))
            print(f"  ✓ {title}  ({pcode}, {arts} 條)  -> {os.path.basename(p)}")
            ok.append(title)
        else:
            print(f"  ✗ 找不到：{name}")
            miss.append(name)
        time.sleep(0.3)

    print(f"\n成功 {len(ok)} 部，失敗 {len(miss)} 部")
    if miss:
        print("失敗清單（多為公會自律規範／金管會令／央行要點，不在全國法規資料庫）：")
        for m in miss:
            print(f"  - {m}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
