"""PDF rendering for offertes.

The render_offerte_pdf function is designed to be monkeypatched in tests.
In production it delegates to WeasyPrint (same pattern as invoice PDF).
"""

from __future__ import annotations

from collections.abc import Mapping
from html import escape
from typing import Any


def render_offerte_pdf(offerte: Mapping[str, Any]) -> bytes:
    """Render an offerte as PDF bytes using WeasyPrint."""
    html = _render_offerte_html(offerte)
    try:
        from weasyprint import HTML  # type: ignore[import-not-found]
    except ImportError as exc:
        msg = (
            "WeasyPrint is required to render offerte PDFs but could not be "
            f"imported. Underlying error: {exc}"
        )
        raise RuntimeError(msg) from exc
    return HTML(string=html).write_pdf()


def _render_offerte_html(offerte: Mapping[str, Any]) -> str:
    """Render a minimal HTML document for the offerte."""
    number = escape(str(offerte.get("offerte_number", "")))
    lines_html = "".join(
        f"<tr><td>{escape(str(ln.get('description', '')))}</td>"
        f"<td>{ln.get('quantity', '')}</td>"
        f"<td>{ln.get('unit_price_cents', 0)}</td></tr>"
        for ln in offerte.get("lines", [])
    )
    return f"""<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><title>Offerte {number}</title></head>
<body>
<h1>OFFERTE {number}</h1>
<table><tbody>{lines_html}</tbody></table>
<p>Totaal: {offerte.get('total_cents', 0)} cent</p>
</body>
</html>"""
