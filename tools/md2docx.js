/* Render GO-TO-MARKET.md as a Word document.
   Deliberately narrow: it handles exactly the markdown this document uses, so it
   stays readable instead of becoming a half-finished general parser. */
const fs = require("node:fs");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle,
  Table, TableRow, TableCell, WidthType, ShadingType, ExternalHyperlink, LevelFormat,
} = require("docx");

const SRC = process.argv[2];
const OUT = process.argv[3];
const CONTENT = 9026;                       // A4 (11906) less 1440 margins each side, in DXA

const VIOLET = "5B2FBF", CYAN = "0D7E92", INK = "1A1725", MUTED = "5C5872",
      RULE = "D8D4E4", HEADBG = "F2EFF8", FLAG = "FBF6E8";

/* ---- inline: **bold**, `code`, [text](url), *italic* ---- */
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*[^*]+\*)/g;
  let last = 0, m;
  const plain = (s) => { if (s) out.push(new TextRun({ text: s, ...base })); };
  while ((m = re.exec(text))) {
    plain(text.slice(last, m.index));
    last = m.index + m[0].length;
    // Recurse into bold/italic: a link inside **bold** is common in this document,
    // and a flat pass emits the raw markdown as literal text.
    if (m[1]) out.push(...runs(m[1].slice(2, -2), { ...base, bold: true }));
    else if (m[2]) out.push(new TextRun({ text: m[2].slice(1, -1), font: "Consolas", size: 18, color: VIOLET, ...base }));
    else if (m[3]) {
      const [, label, url] = m[3].match(/\[([^\]]+)\]\(([^)]+)\)/);
      out.push(new ExternalHyperlink({
        link: url, children: [new TextRun({ ...base, text: label, color: CYAN, underline: {} })],
      }));
    } else if (m[4]) out.push(...runs(m[4].slice(1, -1), { ...base, italics: true }));
  }
  plain(text.slice(last));
  return out.length ? out : [new TextRun({ text: "", ...base })];
}

const cellsOf = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

function table(rows) {
  const header = cellsOf(rows[0]);
  const body = rows.slice(2).map(cellsOf);           // rows[1] is the --- separator
  const n = header.length;
  // Column widths must sum to the table width, or Google Docs renders it wrong.
  const w = Math.floor(CONTENT / n);
  const widths = Array(n).fill(w);
  widths[n - 1] = CONTENT - w * (n - 1);

  const cell = (txt, i, isHead) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: isHead ? { type: ShadingType.CLEAR, fill: HEADBG, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 110, right: 110 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: runs(txt, { size: 18, color: isHead ? MUTED : INK, bold: isHead || undefined }),
    })],
  });

  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
    },
    rows: [
      new TableRow({ tableHeader: true, children: header.map((c, i) => cell(c, i, true)) }),
      ...body.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

/* A markdown paragraph or list item may wrap across several source lines. Treating
   each line as its own paragraph splits sentences AND breaks any **bold** that
   spans the wrap, which then renders as literal asterisks. */
const isBlockStart = (l) =>
  !l.trim() || l.startsWith("|") || /^---+$/.test(l.trim()) || /^#{1,6} /.test(l) ||
  l.startsWith("> ") || /^[-*] /.test(l) || /^\d+\. /.test(l);

/* ------------------------------ walk the file ------------------------------ */
const lines = fs.readFileSync(SRC, "utf8").split("\n");
const kids = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  if (!line.trim()) { i++; continue; }

  if (line.startsWith("|")) {                                   // table
    const block = [];
    while (i < lines.length && lines[i].startsWith("|")) block.push(lines[i++]);
    if (block.length >= 2) { kids.push(table(block)); kids.push(new Paragraph({ spacing: { after: 200 }, children: [] })); }
    continue;
  }

  if (/^---+$/.test(line.trim())) {                              // horizontal rule
    kids.push(new Paragraph({
      spacing: { before: 160, after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } }, children: [],
    }));
    i++; continue;
  }

  if (line.startsWith("### ")) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 260, after: 100 },
      children: runs(line.slice(4), { bold: true, size: 24, color: INK }) }));
    i++; continue;
  }
  if (line.startsWith("## ")) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 140 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: VIOLET } },
      children: runs(line.slice(3), { bold: true, size: 30, color: VIOLET }) }));
    i++; continue;
  }
  if (line.startsWith("# ")) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 160 },
      children: runs(line.slice(2), { bold: true, size: 56, color: INK }) }));
    i++; continue;
  }

  if (line.startsWith("> ")) {                                   // callout
    const block = [];
    while (i < lines.length && lines[i].startsWith(">")) block.push(lines[i++].replace(/^>\s?/, ""));
    kids.push(new Paragraph({
      spacing: { before: 140, after: 200 }, indent: { left: 220, right: 220 },
      shading: { type: ShadingType.CLEAR, fill: FLAG, color: "auto" },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: VIOLET } },
      children: runs(block.join(" ").trim(), { size: 20, color: INK }),
    }));
    continue;
  }

  if (/^[-*] /.test(line)) {                                     // bullets
    while (i < lines.length && /^[-*] /.test(lines[i])) {
      let item = lines[i++].slice(2);
      while (i < lines.length && !isBlockStart(lines[i])) item += " " + lines[i++].trim();
      kids.push(new Paragraph({ numbering: { reference: "bullets", level: 0 },
        spacing: { after: 70 }, children: runs(item, { size: 20, color: INK }) }));
    }
    continue;
  }

  if (/^\d+\. /.test(line)) {                                    // ordered
    while (i < lines.length && /^\d+\. /.test(lines[i])) {
      let item = lines[i++].replace(/^\d+\.\s/, "");
      while (i < lines.length && !isBlockStart(lines[i])) item += " " + lines[i++].trim();
      kids.push(new Paragraph({ numbering: { reference: "ordered", level: 0 },
        spacing: { after: 70 }, children: runs(item, { size: 20, color: INK }) }));
    }
    continue;
  }

  let para = lines[i++];
  while (i < lines.length && !isBlockStart(lines[i])) para += " " + lines[i++].trim();
  kids.push(new Paragraph({ spacing: { after: 140 }, children: runs(para, { size: 20, color: INK }) }));
}

const doc = new Document({
  creator: "JOSHRIX Studio",
  title: "GO-TO-MARKET — JOSHRIX Studio",
  description: "Nairobi launch plan, 18 Aug – 15 Nov 2026",
  styles: { default: { document: { run: { font: "Calibri", size: 20, color: INK } } } },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 220 } } } }] },
      { reference: "ordered", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 220 } } } }] },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: kids,
  }],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(OUT, b);
  console.log(`${OUT} — ${(b.length / 1024).toFixed(0)}KB, ${kids.length} blocks`);
});
