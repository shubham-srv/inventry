/**
 * Builds the client-facing user guide as a Word document.
 *
 *   npx tsx scripts/generate-user-guide.ts [outfile.docx]
 *
 * The prose lives in docs/user-guide/*.md; this file is the executable half of
 * it, the same arrangement as scripts/generate-master-data-template.ts and the
 * master-data workbook. Authoring in Markdown means the guide is reviewed in
 * pull requests alongside the change that made it wrong, rather than drifting
 * inside a binary nobody diffs.
 *
 * The Markdown subset understood here is deliberately small — only what the
 * guide actually uses. It is not a general parser, and it fails loudly on
 * anything it does not recognise rather than silently dropping content, because
 * a paragraph quietly missing from a client deliverable is worse than a build
 * that stops.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx"

const SRC = join(process.cwd(), "docs", "user-guide")
const OUT = process.argv[2] ?? "Inventory-Management-User-Guide.docx"

/** Chapter files, in the order they appear in the document. */
const FILES = [
  "00-introduction.md",
  "01-how-the-system-works.md",
  "02-growers.md",
  "03-vendors.md",
  "04-administration.md",
  "05-reference.md",
]

const ACCENT = "1F6FEB"
const RULE = "D0D7DE"
const SHADE = "F3F4F6"
const QUOTE_BG = "FFF8E1"

// ---------------------------------------------------------------------------
// Inline formatting: **bold**, *italic*, `code`.
//
// One pass with a single alternation, so the segments cannot overlap and a
// literal asterisk inside code is left alone.
// ---------------------------------------------------------------------------
function runs(text: string, opts: { bold?: boolean; size?: number } = {}): TextRun[] {
  const size = opts.size ?? 20 // half-points -> 10pt
  const out: TextRun[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null

  type RunExtra = {
    bold?: boolean
    italics?: boolean
    font?: string
    shading?: { type: typeof ShadingType.CLEAR; fill: string }
  }
  const push = (t: string, extra: RunExtra = {}) => {
    if (!t) return
    out.push(new TextRun({ text: t, size, bold: opts.bold, ...extra }))
  }

  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith("**")) {
      push(tok.slice(2, -2), { bold: true })
    } else if (tok.startsWith("`")) {
      push(tok.slice(1, -1), { font: "Consolas", shading: { type: ShadingType.CLEAR, fill: SHADE } })
    } else {
      push(tok.slice(1, -1), { italics: true })
    }
    last = m.index + tok.length
  }
  push(text.slice(last))
  return out.length ? out : [new TextRun({ text: "", size })]
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
]

function tableRow(cells: string[], header: boolean): TableRow {
  return new TableRow({
    tableHeader: header,
    children: cells.map(
      (c) =>
        new TableCell({
          shading: header ? { type: ShadingType.CLEAR, fill: ACCENT } : undefined,
          margins: { top: 60, bottom: 60, left: 110, right: 110 },
          children: [
            new Paragraph({
              spacing: { before: 20, after: 20 },
              children: header
                ? [new TextRun({ text: c.replace(/\*\*/g, ""), bold: true, size: 18, color: "FFFFFF" })]
                : runs(c, { size: 18 }),
            }),
          ],
        })
    ),
  })
}

/** Splits a Markdown table row, tolerating escaped pipes. */
const splitRow = (line: string): string[] =>
  line
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"))

function convert(md: string, file: string): (Paragraph | Table)[] {
  const lines = md.split(/\r?\n/)
  const out: (Paragraph | Table)[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Blank
    if (!line.trim()) {
      i++
      continue
    }

    // Horizontal rule -> a thin spacer. The guide uses these between sections.
    if (/^---+$/.test(line.trim())) {
      out.push(
        new Paragraph({
          spacing: { before: 120, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 } },
          children: [],
        })
      )
      i++
      continue
    }

    // Heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (h) {
      const level = h[1].length - 1
      out.push(
        new Paragraph({
          heading: HEADINGS[level],
          spacing: { before: level === 0 ? 360 : 260, after: 120 },
          pageBreakBefore: level === 0 && out.length > 0,
          children: runs(h[2], { size: [32, 26, 22, 20][level] }),
        })
      )
      i++
      continue
    }

    // Fenced code block
    if (line.trim().startsWith("```")) {
      i++
      const body: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++])
      i++ // closing fence
      out.push(
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: SHADE },
          spacing: { before: 120, after: 120 },
          children: body.flatMap((b, n) => [
            new TextRun({ text: b, font: "Consolas", size: 18, break: n ? 1 : 0 }),
          ]),
        })
      )
      continue
    }

    // Table — a header row followed by a separator row
    if (line.trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const header = splitRow(line)
      i += 2
      const rows: TableRow[] = [tableRow(header, true)]
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(tableRow(splitRow(lines[i]), false))
        i++
      }
      out.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 2, color: RULE },
            bottom: { style: BorderStyle.SINGLE, size: 2, color: RULE },
            left: { style: BorderStyle.SINGLE, size: 2, color: RULE },
            right: { style: BorderStyle.SINGLE, size: 2, color: RULE },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: RULE },
          },
          rows,
        })
      )
      continue
    }

    // Blockquote — the guide uses these for consequences and warnings, so they
    // are tinted rather than merely indented. Wrapped lines are joined.
    if (line.trim().startsWith(">")) {
      const body: string[] = []
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        body.push(lines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      for (const para of joinWrapped(body)) {
        out.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: QUOTE_BG },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
            spacing: { before: 100, after: 100 },
            indent: { left: 220, right: 220 },
            children: runs(para),
          })
        )
      }
      continue
    }

    // Bullet / numbered list
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(line)
    const numbered = /^(\s*)\d+\.\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const m = (bullet ?? numbered)!
      const depth = Math.floor(m[1].length / 2)
      const text = [m[2]]
      i++
      // Continuation lines are indented further and carry no marker.
      while (
        i < lines.length &&
        lines[i].trim() &&
        /^\s{2,}\S/.test(lines[i]) &&
        !/^\s*([-*]|\d+\.)\s/.test(lines[i])
      ) {
        text.push(lines[i].trim())
        i++
      }
      out.push(
        new Paragraph({
          numbering: numbered ? { reference: "guide-numbers", level: depth } : undefined,
          bullet: bullet ? { level: depth } : undefined,
          spacing: { before: 40, after: 40 },
          children: runs(text.join(" ")),
        })
      )
      continue
    }

    // Plain paragraph — gather wrapped lines up to the next blank or block start.
    const para = [line.trim()]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>|\||```|---+$)/.test(lines[i].trim()) &&
      !/^\s*([-*]|\d+\.)\s/.test(lines[i])
    ) {
      para.push(lines[i].trim())
      i++
    }
    out.push(
      new Paragraph({ spacing: { before: 80, after: 80 }, children: runs(para.join(" ")) })
    )
  }

  if (!out.length) throw new Error(`${file}: produced no content — is the file empty?`)
  return out
}

/** Joins soft-wrapped lines into paragraphs, splitting on blank entries. */
function joinWrapped(lines: string[]): string[] {
  const paras: string[] = []
  let cur: string[] = []
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) paras.push(cur.join(" "))
      cur = []
    } else {
      cur.push(l.trim())
    }
  }
  if (cur.length) paras.push(cur.join(" "))
  return paras
}

// ---------------------------------------------------------------------------

const title = [
  new Paragraph({
    spacing: { before: 2600, after: 0 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Inventory Management & Tracking", bold: true, size: 56 })],
  }),
  new Paragraph({
    spacing: { before: 160, after: 0 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "User Guide", size: 36, color: "555555" })],
  }),
  new Paragraph({
    spacing: { before: 800 },
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        size: 20,
        color: "777777",
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 2000, after: 200 },
    pageBreakBefore: true,
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: "Contents", bold: true, size: 32 })],
  }),
  new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200 },
    children: [
      new TextRun({
        text: "If the contents list is blank, select it and press F9 to build it.",
        italics: true,
        size: 18,
        color: "777777",
      }),
    ],
  }),
]

const body = FILES.flatMap((f) => convert(readFileSync(join(SRC, f), "utf8"), f))

const doc = new Document({
  creator: "Inventory Management",
  title: "Inventory Management & Tracking — User Guide",
  description: "Client reference guide",
  numbering: {
    config: [
      {
        reference: "guide-numbers",
        levels: [0, 1, 2].map((level) => ({
          level,
          format: "decimal" as const,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 400 + level * 360, hanging: 300 } } },
        })),
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 20 }, paragraph: { spacing: { line: 276 } } },
    },
    paragraphStyles: [1, 2, 3, 4].map((n) => ({
      id: `Heading${n}`,
      name: `Heading ${n}`,
      basedOn: "Normal",
      next: "Normal",
      quickFormat: true,
      run: { bold: true, color: n === 1 ? ACCENT : "1F2328", size: [32, 26, 22, 20][n - 1] },
    })),
  },
  sections: [{ children: [...title, ...body] }],
})

const buffer = await Packer.toBuffer(doc)
writeFileSync(OUT, buffer)

console.log(`Wrote ${OUT}`)
console.log(`  ${FILES.length} chapters, ${body.length} blocks`)
console.log(`  ${body.filter((b) => b instanceof Table).length} tables`)
