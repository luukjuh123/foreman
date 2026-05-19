/**
 * Client-side export utilities for CSV and PDF generation.
 */

/**
 * Escapes a CSV cell value: wraps in quotes if it contains a comma, quote, or newline.
 */
function escapeCSVValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Triggers a CSV file download in the browser.
 * Includes UTF-8 BOM (0xEF 0xBB 0xBF) for Dutch Excel compatibility.
 */
export function downloadCSV(
  filename: string,
  headers: string[],
  rows: string[][]
): void {
  const headerLine = headers.map(escapeCSVValue).join(",");
  const dataLines = rows.map((row) => row.map(escapeCSVValue).join(","));
  const csvContent = [headerLine, ...dataLines].join("\r\n");

  // UTF-8 BOM for Excel compatibility
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Opens a new browser window with styled HTML and triggers the browser's print/Save as PDF dialog.
 */
export function printToPDF(title: string, contentHtml: string): void {
  const now = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <title>${title} — Foreman</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 32px; }
    header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    header .company { font-size: 20px; font-weight: bold; }
    header .meta { text-align: right; color: #555; }
    h1 { font-size: 16px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f0f0f0; text-align: left; padding: 6px 8px; border-bottom: 1px solid #ccc; font-weight: bold; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; }
    tr.section-header td { font-weight: bold; background: #fafafa; border-top: 1px solid #ccc; padding-top: 10px; }
    tr.total-row td { font-weight: bold; border-top: 2px solid #111; }
    td.amount { text-align: right; font-variant-numeric: tabular-nums; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <header>
    <div class="company">Foreman</div>
    <div class="meta">
      <div>${title}</div>
      <div>Datum: ${now}</div>
    </div>
  </header>
  <h1>${title}</h1>
  ${contentHtml}
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.print();
}
