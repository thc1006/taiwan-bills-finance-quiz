#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
比對每一題解析所引用的法條，是否仍存在於現行條文中。

**這支工具在做什麼 —— 以及它不能做什麼**

能做：解析文字裡若寫「依票券金融管理法第 21 條規定」，就去現行的票券金融管理法
      條文集裡確認第 21 條真的存在。找不到 = 該條已刪除或已重新編號，
      這一題的解析（很可能連同答案）就有過時風險。

不能做：**它完全不檢查答案對不對。** 一題可以引用一個存在的法條，卻選錯選項；
      也可以引用一個已刪除的法條，答案卻仍然正確（因為實質規定只是搬家）。
      把 `verified_article_exists` 讀成「這題答案是對的」是錯的。

法規語料庫：../04_法規彙編/*.md（17 部票券法規，擷取自全國法規資料庫 2026-07-25）

誠實性設計：
  - 不在語料庫內的法規（銀行法、中央銀行法、函令、自律規範…）標為
    law_outside_corpus / cited_document_not_in_corpus，而不是預設它通過。
  - parser 漏抓的題目**不會**被算成 no_citation 混過去 —— meta 內另記
    parser_coverage，讓「沒查到」與「沒有引用」兩件事分得開。
"""
from __future__ import annotations

import difflib
import json
import os
import re
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
COLLECTION = os.path.dirname(REPO)
LAW_DIR = os.path.join(COLLECTION, "04_法規彙編")
DATASET = os.path.join(REPO, "quiz-app", "src", "data", "dataset.json")

CN_DIGITS = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
             "六": 6, "七": 7, "八": 8, "九": 9, "十": 10, "百": 100,
             "壹": 1, "貳": 2, "參": 3, "肆": 4, "伍": 5,
             "陸": 6, "柒": 7, "捌": 8, "玖": 9, "拾": 10}

NUM = r"[0-9０-９一二三四五六七八九十百壹貳參肆伍陸柒捌玖拾]+"
DOC_SUFFIX = r"(?:法|規則|辦法|標準|準則|條例|規範|要點|注意事項|細則|規定|範本)"

# 來源檔常見的簡稱／錯字 → 正式名稱
ALIASES = {
    "票金法": "票券金融管理法",
    "票券金融法": "票券金融管理法",
    "票券管理法": "票券金融管理法",
    "票券據法": "票據法",
}

# 常見但**不在**語料庫中的法規（誠實標示「未查」，不假裝通過）
OUTSIDE = [
    "銀行法", "銀行法施行細則", "中央銀行法", "證券交易法", "洗錢防制法",
    "資恐防制法", "公司法", "票據法", "金融控股公司法", "金融資產證券化條例",
    "國庫券及短期借款條例", "所得稅法", "加值型及非加值型營業稅法",
    "個人資料保護法", "銀行業防制洗錢及打擊資恐注意事項",
    "金融控股公司及銀行業內部控制及稽核制度實施辦法",
    "中央銀行對銀行辦理融通作業要點",
]

FUZZY_THRESHOLD = 0.86


def cn_to_int(s: str) -> int | None:
    s = s.strip()
    if s.isdigit():
        return int(s)
    if not s or any(c not in CN_DIGITS for c in s):
        return None
    total, section, last = 0, 0, 0
    for c in s:
        v = CN_DIGITS[c]
        if v == 100:
            section = (section or 1) * 100
            total += section
            section = 0
        elif v == 10:
            section = (last or 1) * 10
            last = 0
        else:
            last = v
    return total + section + last


def norm_num(raw: str) -> int | None:
    return cn_to_int(raw.strip().translate(str.maketrans("０１２３４５６７８９", "0123456789")))


def norm_name(s: str) -> str:
    return re.sub(r"[\s「」『』（）()、,，之]", "", s).replace("臺", "台")


ART_MAX_CHARS = 420

# 法規名稱 -> 全國法規資料庫網址（由語料庫 md 檔的「來源：」行填入）
LAW_URLS: dict[str, str] = {}

# 條號有缺口的法規 -> 缺哪些號。代表本工具的條文抽取可能不完整，
# 這些法規上的 article_not_found 不可信，一律降級為 indeterminate。
SUSPECT_LAWS: dict[str, list[int]] = {}


def load_corpus() -> dict[str, dict[str, str]]:
    """回傳 {法規名稱: {條號: 該條現行條文}}；條號含「之N」者記為 '21-1'。

    條文原文會被嵌進資料集，讓使用者作答時能**直接對照現行法**，
    而不是只看一段可能已經過時的解析。
    """
    corpus: dict[str, dict[str, str]] = {}
    if not os.path.isdir(LAW_DIR):
        return corpus
    for fn in sorted(os.listdir(LAW_DIR)):
        if not fn.endswith(".md"):
            continue
        text = open(os.path.join(LAW_DIR, fn), encoding="utf-8").read()
        m = re.search(r"^#\s*(.+)$", text, re.M)
        if not m:
            continue
        # MOJ 條文標題可能帶前綴標記，例如「本條文有附件 第 4 條」。
        # 少抓一個標題 = 那一條會被誤判成「已不存在」，進而把一批正確的題目
        # 錯誤標記為過時 —— 這正是第一版的實際錯誤（10 條被漏掉、8 題被誤判）。
        # 因此除了放寬 regex，下方另有 gap 偵測作為第二道防線。
        heads = list(re.finditer(
            rf"^\s*(?:本條文有(?:附件|附表|圖表)\s*)?第\s*({NUM})\s*條(?:\s*之\s*({NUM}))?\s*$",
            text, re.M))
        arts: dict[str, str] = {}
        for i, am in enumerate(heads):
            n = norm_num(am.group(1))
            if n is None:
                continue
            sub = norm_num(am.group(2)) if am.group(2) else None
            key = f"{n}-{sub}" if sub else str(n)
            end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
            body = re.sub(r"\n{2,}", "\n", text[am.end():end]).strip()
            if len(body) > ART_MAX_CHARS:
                body = body[:ART_MAX_CHARS].rstrip() + "…（節錄）"
            arts.setdefault(key, body)
        law_name = m.group(1).strip()
        corpus[law_name] = arts
        um = re.search(r"來源：全國法規資料庫\s+(\S+)", text)
        if um:
            LAW_URLS[law_name] = um.group(1)

        # gap 偵測：條號應該是連續的。出現缺口 → 幾乎一定是標題行沒被抓到，
        # 而不是立法者真的跳號。有缺口的法規會被列入 SUSPECT_LAWS，
        # 其 article_not_found 一律降級為 indeterminate（寧可說「不確定」，
        # 也不要拿自己的解析瑕疵去指控題目過時）。
        nums = sorted({int(k.split("-")[0]) for k in arts})
        if nums:
            gaps = [n for n in range(nums[0], nums[-1] + 1) if n not in nums]
            if gaps:
                SUSPECT_LAWS[law_name] = gaps
    return corpus


class Resolver:
    def __init__(self, corpus: dict[str, set[str]]):
        self.corpus = corpus
        self.corpus_norm = {norm_name(k): k for k in corpus}
        self.outside_norm = {norm_name(k): k for k in OUTSIDE}
        self.alias_norm = {norm_name(k): v for k, v in ALIASES.items()}

    def resolve(self, raw: str) -> tuple[str, str, str]:
        """回傳 (kind, canonical_name, match_mode)。
        kind ∈ {'corpus', 'outside', 'unknown'}"""
        n = norm_name(raw)
        if n in self.alias_norm:
            n = norm_name(self.alias_norm[n])
        if n in self.corpus_norm:
            return "corpus", self.corpus_norm[n], "exact"
        if n in self.outside_norm:
            return "outside", self.outside_norm[n], "exact"
        hit = difflib.get_close_matches(n, list(self.corpus_norm), n=1, cutoff=FUZZY_THRESHOLD)
        if hit:
            return "corpus", self.corpus_norm[hit[0]], "fuzzy"
        hit = difflib.get_close_matches(n, list(self.outside_norm), n=1, cutoff=FUZZY_THRESHOLD)
        if hit:
            return "outside", self.outside_norm[hit[0]], "fuzzy"
        return "unknown", raw, "none"


ART_RE = re.compile(rf"第\s*({NUM})\s*條(?:\s*之\s*({NUM}))?")
DOC_BEFORE_RE = re.compile(rf"([一-鿿]{{2,40}}?{DOC_SUFFIX})\s*[」』]?\s*$")


def extract_citations(expl: str) -> list[tuple[str, str]]:
    """回傳 [(文件名稱, 條號)]，依出現順序。"""
    out = []
    for m in ART_RE.finditer(expl):
        n = norm_num(m.group(1))
        if n is None:
            continue
        sub = norm_num(m.group(2)) if m.group(2) else None
        art = f"{n}-{sub}" if sub else str(n)
        before = expl[max(0, m.start() - 60): m.start()]
        dm = DOC_BEFORE_RE.search(before)
        if dm:
            out.append((dm.group(1), art))
    return out


def main() -> int:
    corpus = load_corpus()
    if not corpus:
        print(f"ERROR: 找不到法規語料庫 {LAW_DIR}", file=sys.stderr)
        return 1
    resolver = Resolver(corpus)
    print(f"法規語料庫：{len(corpus)} 部，{sum(len(v) for v in corpus.values())} 條")

    ds = json.load(open(DATASET, encoding="utf-8"))
    counts = Counter()
    has_article_ref = 0
    parsed = 0
    missing, unknown_docs = [], Counter()

    for q in ds["items"]:
        expl = q.get("explanation") or ""
        if ART_RE.search(expl):
            has_article_ref += 1
        cites = extract_citations(expl)
        if not cites:
            q["law_citation"] = {"status": "no_citation"}
            counts["no_citation"] += 1
            continue
        parsed += 1
        raw, art = cites[0]
        kind, name, mode = resolver.resolve(raw)
        rec: dict = {"law": name, "article": art}
        if mode == "fuzzy":
            rec["raw_law_name"] = raw
            rec["matched_via"] = "fuzzy"
        if kind == "corpus":
            if art in corpus[name]:
                rec["status"] = "verified_article_exists"
                # 嵌入現行條文原文，讓使用者作答後能直接對照現行法，
                # 而不是只讀一段可能已過時的解析。
                rec["current_text"] = corpus[name][art]
                rec["source_url"] = LAW_URLS.get(name)
            elif name in SUSPECT_LAWS:
                # 這部法規的條文抽取有缺口 —— 說「這條不存在」很可能是我們自己漏抓。
                rec["status"] = "indeterminate"
                rec["reason"] = "corpus_extraction_has_gaps"
            else:
                rec["status"] = "article_not_found"
                if len(missing) < 15:
                    missing.append((q["id"], name, art, q["stem"][:36]))
        elif kind == "outside":
            rec["status"] = "law_outside_corpus"
        else:
            rec["status"] = "cited_document_not_in_corpus"
            unknown_docs[raw] += 1
        counts[rec["status"]] += 1
        q["law_citation"] = rec

    total = sum(counts.values())
    ds["meta"]["law_citation_audit"] = {
        "checked_at": "2026-07-25",
        "corpus": {
            "source": "全國法規資料庫（law.moj.gov.tw）",
            "laws": len(corpus),
            "articles": sum(len(v) for v in corpus.values()),
            "retrieved_at": "2026-07-25",
        },
        "counts": dict(counts),
        "corpus_gap_warnings": SUSPECT_LAWS,
        "parser_coverage": {
            "explanations_containing_article_ref": has_article_ref,
            "successfully_parsed": parsed,
            "note": "兩者的差額是 parser 抓不出文件名稱的題（多為函令字號或無名稱引用），"
                    "它們被歸入 no_citation —— 那代表『沒查到』，不代表『沒有引用』。",
        },
        "what_this_means": (
            "verified_article_exists = 解析引用的法條在現行條文中仍然存在，"
            "**不代表該題答案正確**。article_not_found = 引用之條號已不存在於現行條文，"
            "該題解析（可能連同答案）有過時風險。"
            "law_outside_corpus / cited_document_not_in_corpus = 引用的法規或文件"
            "不在本語料庫內，**未進行檢查**。"
        ),
    }

    json.dump(ds, open(DATASET, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    open(DATASET, "a", encoding="utf-8").write("\n")

    if SUSPECT_LAWS:
        print("\n⚠ 條號有缺口的法規（條文抽取可能不完整，其 not_found 已降級為 indeterminate）：")
        for k, v in SUSPECT_LAWS.items():
            print(f"    {k}: 缺 {v}")

    print("\n=== 引用法條稽核結果 ===")
    for k in ["verified_article_exists", "article_not_found", "indeterminate",
              "law_outside_corpus", "cited_document_not_in_corpus", "no_citation"]:
        v = counts.get(k, 0)
        print(f"  {k:30s} {v:5d}  ({round(v / total * 100, 1)}%)")
    print(f"\nparser 覆蓋：解析含「第N條」的題 {has_article_ref} 題，成功解析 {parsed} 題"
          f"（漏 {has_article_ref - parsed} 題，多為函令字號）")
    if missing:
        print("\n=== ⚠ 引用條號已不存在於現行條文（過時風險） ===")
        for i, (qid, law, art, stem) in enumerate(missing, 1):
            print(f"  {i:2d}. [{qid}] {law} 第{art}條 — {stem}…")
    if unknown_docs:
        print("\n=== 語料庫未收錄的被引用文件 top 10 ===")
        for d, c in unknown_docs.most_common(10):
            print(f"  {c:4d}  {d}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
