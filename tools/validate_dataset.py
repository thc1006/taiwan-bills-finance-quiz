#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
以 JSON Schema 驗證 dataset.json，並執行 schema 表達不了的跨欄位規則。

schema 擋得住結構走樣；擋不住的是**語意上的謊**——
例如把社群來源的 authority 標成 official、或把「已查證題數」從 0 悄悄調高。
那類規則寫在下方的 semantic_checks()。
"""
from __future__ import annotations

import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATASET = os.path.join(REPO, "quiz-app", "src", "data", "dataset.json")
SCHEMA_DIR = os.path.join(REPO, "schemas")


def load_schema():
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    registry = Registry()
    for name in ("item.schema.json", "dataset.schema.json"):
        with open(os.path.join(SCHEMA_DIR, name), encoding="utf-8") as fh:
            registry = registry.with_resource(name, Resource.from_contents(json.load(fh)))
    with open(os.path.join(SCHEMA_DIR, "dataset.schema.json"), encoding="utf-8") as fh:
        root = json.load(fh)
    return Draft202012Validator(root, registry=registry)


def semantic_checks(ds: dict) -> list[str]:
    errs: list[str] = []
    items = ds["items"]
    meta = ds["meta"]
    source_ids = {s["source_id"] for s in ds["sources"]}

    # 1) 答案必須對應到實際存在的選項
    for q in items:
        if not any(o["key"] == q["answer"] for o in q["options"]):
            errs.append(f"{q['id']}: answer={q['answer']} 沒有對應的選項")

    # 2) source_id 必須在 sources 中宣告
    for q in items:
        if q["source_id"] not in source_ids:
            errs.append(f"{q['id']}: 未宣告的 source_id={q['source_id']}")

    # 3) meta 統計必須與實際相符（統計說謊比沒有統計更糟）
    if meta["total_questions"] != len(items):
        errs.append(f"meta.total_questions={meta['total_questions']} 但實際 {len(items)} 題")
    for subject, n in meta["by_subject"].items():
        actual = sum(1 for q in items if q["subject"] == subject)
        if actual != n:
            errs.append(f"meta.by_subject[{subject}]={n} 但實際 {actual}")
    for st, n in meta["by_source_type"].items():
        actual = sum(1 for q in items if q["provenance"]["source_type"] == st)
        if actual != n:
            errs.append(f"meta.by_source_type[{st}]={n} 但實際 {actual}")

    # 4) 誠實性：不得在未實際查證時宣稱已查證
    if meta["answer_verification"]["verified_against_official_key"] != 0:
        errs.append(
            "meta.answer_verification.verified_against_official_key 不為 0 —— "
            "若真的做了逐條核對，請一併提交核對紀錄並更新本檢查"
        )

    # 5) 現行條文原文只能掛在已確認存在的條號上
    for q in items:
        lc = q.get("law_citation", {})
        if lc.get("current_text") and lc.get("status") != "verified_article_exists":
            errs.append(f"{q['id']}: current_text 掛在 status={lc.get('status')} 上")

    # 6) 稽核計數必須與逐題狀態相符
    audit = meta.get("law_citation_audit", {}).get("counts", {})
    for status, n in audit.items():
        actual = sum(1 for q in items if q.get("law_citation", {}).get("status") == status)
        if actual != n:
            errs.append(f"law_citation_audit.counts[{status}]={n} 但實際 {actual}")

    # 7) 同科內不得有重複題（跨科重複是來源既有事實，由抽題層去重）
    import re
    import unicodedata

    def fp(s: str) -> str:
        s = unicodedata.normalize("NFKC", s)
        s = re.sub(r"\s+", "", s)
        # 與 build_dataset.py 的 norm_text、TS 端的 fingerprint 三方必須一致
        s = re.sub(r"[，。？?、：:；;（）()「」『』【】\[\].,‐-―\-_/\\~｜|]", "", s)
        return s.replace("臺", "台")

    for subject in {q["subject"] for q in items}:
        seen: dict[str, str] = {}
        for q in items:
            if q["subject"] != subject:
                continue
            k = fp(q["stem"])
            if k in seen:
                errs.append(f"同科重複題：[{subject}] {seen[k]} ↔ {q['id']}")
            seen[k] = q["id"]

    return errs


def main() -> int:
    with open(DATASET, encoding="utf-8") as fh:
        ds = json.load(fh)

    validator = load_schema()
    schema_errors = sorted(validator.iter_errors(ds), key=lambda e: list(e.path))
    for e in schema_errors[:25]:
        loc = "/".join(str(p) for p in e.path)
        print(f"SCHEMA  {loc}: {e.message}", file=sys.stderr)
    if len(schema_errors) > 25:
        print(f"… 另有 {len(schema_errors) - 25} 個 schema 錯誤", file=sys.stderr)

    sem_errors = semantic_checks(ds)
    for e in sem_errors[:25]:
        print(f"SEMANTIC {e}", file=sys.stderr)
    if len(sem_errors) > 25:
        print(f"… 另有 {len(sem_errors) - 25} 個語意錯誤", file=sys.stderr)

    total = len(schema_errors) + len(sem_errors)
    if total:
        print(f"\n❌ 驗證失敗：{len(schema_errors)} schema + {len(sem_errors)} semantic", file=sys.stderr)
        return 1

    print(f"✅ dataset.json 驗證通過（{len(ds['items'])} 題，{len(ds['sources'])} 個來源）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
