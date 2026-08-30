#!/usr/bin/env python3
"""Extract product data from the sextoydistributing.com clone.

Walks every product .html page, pulls the schema.org Product ld+json block,
and writes catalog/products.json (one record per product) plus a summary.

Usage: python3 scripts/extract_catalog.py
"""
import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CLONE = ROOT / "www.sextoydistributing.com" / "www.sextoydistributing.com"
OUT_DIR = ROOT / "catalog"
OUT_DIR.mkdir(exist_ok=True)

LDJSON_RE = re.compile(
    r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>',
    re.DOTALL,
)


def strip_html(text: str) -> str:
    """Unescape entity-encoded HTML and drop tags, keeping readable text."""
    text = html.unescape(text)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def parse_page(path: pathlib.Path):
    try:
        raw = path.read_text(errors="replace")
    except OSError:
        return None
    for match in LDJSON_RE.finditer(raw):
        block = match.group(1)
        if '"@type": "Product"' not in block and '"@type":"Product"' not in block:
            continue
        # ld+json blocks embed literal newlines inside description strings;
        # normalize control chars so json.loads accepts them.
        cleaned = re.sub(r"[\x00-\x1f]", " ", block)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return {"_error": "json", "handle": path.stem}
        offers = data.get("offers") or {}
        desc_html = html.unescape(data.get("description") or "")
        return {
            "handle": path.stem,
            "title": data.get("name"),
            "sku": data.get("sku") or data.get("mpn"),
            "brand": (data.get("brand") or {}).get("name"),
            "price": offers.get("price"),
            "currency": offers.get("priceCurrency", "USD"),
            "in_stock": "InStock" in (offers.get("availability") or ""),
            "images": data.get("image") or [],
            "description_html": desc_html,
            "description_text": strip_html(data.get("description") or ""),
            "source_url": data.get("url"),
        }
    return None


def main() -> int:
    if not CLONE.is_dir():
        print(f"clone dir not found: {CLONE}", file=sys.stderr)
        return 1
    products, errors, skipped = [], [], 0
    for path in sorted(CLONE.glob("*.html")):
        rec = parse_page(path)
        if rec is None:
            skipped += 1
        elif rec.get("_error"):
            errors.append(rec["handle"])
        else:
            products.append(rec)

    # de-dupe by SKU (variant pages can repeat)
    seen, unique = set(), []
    for p in products:
        key = p["sku"] or p["handle"]
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)

    out = OUT_DIR / "products.json"
    out.write_text(json.dumps(unique, indent=1))
    brands = {p["brand"] for p in unique if p["brand"]}
    print(
        f"products: {len(unique)} (raw {len(products)}), "
        f"non-product pages skipped: {skipped}, parse errors: {len(errors)}, "
        f"brands: {len(brands)}"
    )
    if errors:
        (OUT_DIR / "errors.json").write_text(json.dumps(errors, indent=1))
        print(f"error handles written to {OUT_DIR / 'errors.json'}")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
