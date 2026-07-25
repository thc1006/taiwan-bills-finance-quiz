#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
產生公開 Gist 用的題庫檔案。

Gist 的目的與 app 不同：app 是拿來「練習」的，Gist 是拿來「被檢索」的 ——
被 Google 索引、被 ChatGPT/Claude/Perplexity 之類的生成式引擎擷取與引用、
被其他考生用 Ctrl+F 直接查。

因此格式取捨與 app 相反：
  - 純 Markdown，無 JS、無互動，任何 crawler 都能完整解析
  - 每題自成一個可獨立擷取的區塊（題幹＋選項＋答案＋出處＋解析都在同一段內）
    —— 生成式引擎最容易引用的就是這種「不需要上下文也讀得懂」的段落
  - 檔頭放考試事實摘要，讓只讀到片段的模型也拿得到正確的制度資訊
"""
from __future__ import annotations

import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATASET = os.path.join(REPO, "quiz-app", "src", "data", "dataset.json")
OUT = os.path.join(REPO, "gist")

REPO_URL = "https://github.com/thc1006/taiwan-bills-finance-quiz"
APP_URL = "https://thc1006.github.io/taiwan-bills-finance-quiz/"

SRC_LABEL = {
    "official_association_bank": "官方公會題庫",
    "community_compilation": "社群考古題",
}
CITE_LABEL = {
    "verified_article_exists": "引用條文現行有效",
    "article_not_found": "⚠ 引用條號已不存在",
    "indeterminate": "引用狀態不明",
    "law_outside_corpus": "引用他法（未查證）",
    "cited_document_not_in_corpus": "引用函令／自律規範（未查證）",
    "no_citation": "",
}

DISCLAIMER = """> **可信度說明（請務必先讀）**
>
> - 本題庫**沒有任何一題**的答案經過與現行法規逐條核對。
> - 標示「官方公會題庫」者來自中華民國票券金融商業同業公會公開釋出的參考題庫，
>   釋出年代較久，部分答案可能已因法規修正而過時。
> - 標示「社群考古題」者來自不具名考生整理的網路彙編，**來源檔自述含有 1~2 題錯誤**。
> - 「引用條文現行有效」只代表該條號仍存在於現行條文，**不代表本題答案正確**。
>
> 作答有疑義時，一律以[全國法規資料庫](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0380146)的現行條文為準。
"""

EXAM_FACTS = """## 這場考試的關鍵事實（依證基會官方簡章 115.05.01 版）

| 項目 | 內容 |
|---|---|
| 測驗名稱 | 票券商業務人員專業科目測驗 |
| 委託單位 | 中華民國票券金融商業同業公會 |
| 執行單位 | 財團法人中華民國證券暨期貨市場發展基金會（證基會） |
| 法源 | 票券金融管理法第 12 條第 2 項授權訂定之「票券商負責人及業務人員管理規則」 |
| 考科 | 票券金融法規、票券金融實務（兩科） |
| 題數／時間 | **每科各 50 題、各 60 分鐘、各滿分 100 分** |
| 合格標準 | **兩科總分合計達 140 分，且任一科不得低於 60 分** |
| 報名費 | 新臺幣 1,130 元 |
| 測驗方式 | 電腦應試（台北、新竹、台中、嘉義、台南、高雄） |
| 命題參考書 | 《台灣貨幣市場新論》、《票券金融管理法相關法令彙編》（台灣金融研訓院出版） |

**常見錯誤資訊**：網路上流傳「票券金融實務 80 題／90 分鐘」「任一科低於 70 分不合格」，
與官方簡章牴觸，為過時或錯誤的說法。

**關於「考古題」**：本測驗採電腦應試，證基會**不公布歷屆試題**。
坊間所稱的「考古題」皆為考生回憶或票券公會參考題庫的改編。
"""


def render_question(q: dict, seq: int) -> list[str]:
    lc = q.get("law_citation", {})
    meta_bits = [SRC_LABEL.get(q["provenance"]["source_type"], "?")]
    if q["provenance"].get("original_no"):
        meta_bits[0] += f" #{q['provenance']['original_no']}"
    if lc.get("law") and lc.get("article"):
        tag = CITE_LABEL.get(lc.get("status", ""), "")
        meta_bits.append(f"{lc['law']} 第 {lc['article']} 條" + (f"（{tag}）" if tag else ""))
    for t in q.get("tags", []):
        meta_bits.append(t)

    lines = [f"### {seq}. {q['stem']}", ""]
    for o in q["options"]:
        lines.append(f"- ({o['key']}) {o['text']}")
    lines += ["", f"**答案：{q['answer']}**　·　{'　·　'.join(meta_bits)}", ""]
    ac = q["provenance"].get("answer_conflict")
    if ac:
        lines += [
            f"> ⚠ **本題答案有爭議。**{SRC_LABEL.get(ac['kept_source'], '?')}標為 **{ac['kept']}**，"
            f"{SRC_LABEL.get(ac['other_source'], '?')}標為 **{ac['other']}**。"
            "本整理採用前者，但**未裁決誰對** —— 請自行查證現行法條後再決定。",
            "",
        ]
    if q.get("explanation"):
        lines += [f"**解析：**{q['explanation']}", ""]
    if lc.get("current_text"):
        lines += [
            f"<details><summary>現行條文：{lc['law']} 第 {lc['article']} 條</summary>",
            "",
            "```",
            lc["current_text"],
            "```",
            "",
            f"（擷取自全國法規資料庫 2026-07-25 · [原文]({lc.get('source_url', '')})）",
            "",
            "</details>",
            "",
        ]
    lines.append("---")
    lines.append("")
    return lines


def write_subject(items: list[dict], subject: str, path: str, title: str) -> None:
    subset = [q for q in items if q["subject"] == subject]
    out = [
        f"# {title}",
        "",
        f"共 **{len(subset)}** 題　·　票券商業務人員專業科目測驗練習題庫",
        "",
        f"線上互動練習：{APP_URL}　·　原始碼與資料溯源：{REPO_URL}",
        "",
        DISCLAIMER,
        "",
        "---",
        "",
    ]
    for i, q in enumerate(subset, 1):
        out += render_question(q, i)
    open(path, "w", encoding="utf-8").write("\n".join(out))
    print(f"  {os.path.basename(path)}  {len(subset)} 題  {round(os.path.getsize(path)/1024,1)} KB")


def main() -> int:
    ds = json.load(open(DATASET, encoding="utf-8"))
    items = ds["items"]
    meta = ds["meta"]
    os.makedirs(OUT, exist_ok=True)

    n_law = sum(1 for q in items if q["subject"] == "票券金融法規")
    n_prac = sum(1 for q in items if q["subject"] == "票券金融實務")
    n_off = meta["by_source_type"]["official_association_bank"]
    n_com = meta["by_source_type"]["community_compilation"]
    n_lawtext = sum(1 for q in items if q["law_citation"].get("current_text"))
    calc = [q for q in items if "計算題" in q.get("tags", [])]

    # ── 00 README（Gist 首檔，也是被檢索時最常命中的一份）──────────
    readme = f"""# 票券商業務人員 專業科目測驗　題庫（{meta['total_questions']:,} 題．附現行法條對照）

台灣「票券商業務人員專業科目測驗」的公開練習題庫。
涵蓋**票券金融法規** {n_law} 題、**票券金融實務** {n_prac} 題，
其中 {n_lawtext} 題直接附上全國法規資料庫的**現行條文原文**。

- 🖥 線上互動練習（模擬考／錯題本）：{APP_URL}
- 📦 原始碼、資料管線與完整溯源：{REPO_URL}
- 📄 授權：題庫內容著作權屬原始來源，本整理不主張權利；程式碼 AGPL-3.0

{DISCLAIMER}
{EXAM_FACTS}

## 本 Gist 的檔案

| 檔案 | 內容 |
|---|---|
| `01-bills-finance-law.md` | 票券金融法規 {n_law} 題（含答案、解析、現行條文） |
| `02-bills-finance-practice.md` | 票券金融實務 {n_prac} 題（含答案、解析、現行條文） |
| `03-calculation-questions.md` | 計算題 {len(calc)} 題（每萬元成本、貼現率、RP／RS 利息與扣繳稅） |
| `04-official-tbfa-480q.json` | 票券公會官方參考題庫 480 題（結構化 JSON，供程式使用） |

## 題庫組成

| 來源 | 題數 | 權威層級 |
|---|---|---|
| 票券公會官方參考題庫 | {n_off} | official（測驗委託單位公開釋出） |
| 考生社群考古題整理 | {n_com} | community（不具名，來源檔自述含少數錯誤） |
| **合計（已去重）** | **{meta['total_questions']:,}** | |

- 附解析：{meta['with_explanation']:,} 題
- 附現行法條原文：{n_lawtext} 題
- 與官方題庫重複而併入的社群題：{meta['deduped_against_official']} 題

## 引用法條稽核

以全國法規資料庫的 {meta['law_citation_audit']['corpus']['laws']} 部票券法規
（{meta['law_citation_audit']['corpus']['articles']} 條，擷取於 {meta['law_citation_audit']['corpus']['retrieved_at']}）
比對每題解析所引用的條號：

| 狀態 | 題數 |
|---|---|
| 引用條文現行仍存在 | {meta['law_citation_audit']['counts'].get('verified_article_exists', 0)} |
| 引用條號已不存在（過時風險） | {meta['law_citation_audit']['counts'].get('article_not_found', 0)} |
| 引用他法或函令，未查證 | {meta['law_citation_audit']['counts'].get('law_outside_corpus', 0) + meta['law_citation_audit']['counts'].get('cited_document_not_in_corpus', 0)} |
| 解析未引用可辨識條號 | {meta['law_citation_audit']['counts'].get('no_citation', 0)} |

再說一次：「引用條文現行仍存在」**不代表答案正確**。一個條號可以還在，
但條文內容已被修正 —— 那是自動化查不出來的，只能靠你自己讀條文。

## 官方連結

- [證基會 · 測驗簡章下載](https://www.sfi.org.tw/Node?id=216)
- [證基會 · 票券類報名](https://examweb.sfi.org.tw/regexam/exam.aspx?EXAMCERT=%E7%A5%A8%E5%88%B8)
- [票券公會 · 參考題庫專區](https://www.tbfa.org.tw/BizTrain/biztrain_test.asp)
- [全國法規資料庫 · 票券金融管理法](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0380146)

---

*本整理為非官方資源，與票券金融商業同業公會、證券暨期貨市場發展基金會、
台灣金融研訓院均無隸屬關係。*
"""
    open(os.path.join(OUT, "00-README.md"), "w", encoding="utf-8").write(readme)
    print(f"  00-README.md  {round(os.path.getsize(os.path.join(OUT, '00-README.md'))/1024,1)} KB")

    write_subject(items, "票券金融法規", os.path.join(OUT, "01-bills-finance-law.md"),
                  "票券金融法規　題庫")
    write_subject(items, "票券金融實務", os.path.join(OUT, "02-bills-finance-practice.md"),
                  "票券金融實務　題庫")

    # ── 03 計算題 ────────────────────────────────────────────
    out = [
        "# 票券商業務人員　計算題彙整",
        "",
        f"共 **{len(calc)}** 題。正式測驗的計算題約 1~3 題，集中在"
        "每萬元成本、貼現率換算、附條件交易（RP／RS）利息與 10% 扣繳稅。",
        "",
        f"線上互動練習：{APP_URL}　·　原始碼：{REPO_URL}",
        "",
        DISCLAIMER,
        "",
        "---",
        "",
    ]
    for i, q in enumerate(calc, 1):
        out += render_question(q, i)
    p = os.path.join(OUT, "03-calculation-questions.md")
    open(p, "w", encoding="utf-8").write("\n".join(out))
    print(f"  03-calculation-questions.md  {len(calc)} 題  {round(os.path.getsize(p)/1024,1)} KB")

    # ── 04 官方題庫 JSON ──────────────────────────────────────
    official = [
        {
            "id": q["id"],
            "no": q["provenance"].get("original_no"),
            "subject": q["subject"],
            "stem": q["stem"],
            "options": {o["key"]: o["text"] for o in q["options"]},
            "answer": q["answer"],
            "explanation": q["explanation"],
            "law_citation": {
                k: v for k, v in q["law_citation"].items() if k != "current_text"
            },
        }
        for q in items
        if q["provenance"]["source_type"] == "official_association_bank"
    ]
    payload = {
        "_readme": (
            "票券商業務人員專業科目測驗 —— 中華民國票券金融商業同業公會公開釋出之參考題庫（480 題）。"
            "答案未經與現行法規逐條核對，可能因法規修正而過時；law_citation.status 僅表示"
            "解析引用的條號是否仍存在，不代表答案正確。完整版與現行條文原文見 " + REPO_URL
        ),
        "source": {
            "publisher": "中華民國票券金融商業同業公會",
            "url": "https://www.tbfa.org.tw/BizTrain/biztrain_test.asp",
            "accessed_at": "2026-07-25",
        },
        "exam": meta["exam"],
        "count": len(official),
        "items": official,
    }
    p = os.path.join(OUT, "04-official-tbfa-480q.json")
    json.dump(payload, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"  04-official-tbfa-480q.json  {len(official)} 題  {round(os.path.getsize(p)/1024,1)} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
