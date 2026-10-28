const PDF_STRING = /\((?:\\.|[^\\)])*\)/g;
const FIXTURE_MARK = /ACCORDIQ_FIXTURE:[a-z0-9-]+/g;
const XML_TEXT = /<w:t[^>]*>([^<]*)<\/w:t>/g;

function unescapePdf(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

export function fixtureIdFromText(text: string): string | null {
  const match = /ACCORDIQ_FIXTURE:([a-z0-9-]+)/.exec(text);
  return match?.[1] ?? null;
}

/** Naive plaintext gate. Scanned or compressed documents return empty — that is a failure, not a guess. */
export function extractPlainText(bytes: Uint8Array, contentType: string): string {
  const latin1 = Buffer.from(bytes).toString("latin1");
  const type = contentType.toLowerCase();
  if (type.includes("pdf") || latin1.startsWith("%PDF")) {
    const marks = latin1.match(FIXTURE_MARK) ?? [];
    const strings = [...latin1.matchAll(PDF_STRING)].map((match) =>
      unescapePdf(match[0].slice(1, -1)),
    );
    return [...marks, ...strings].join("\n").replace(/\s+\n/g, "\n").trim();
  }
  if (type.includes("wordprocessingml") || type.includes("officedocument")) {
    const xml = [...latin1.matchAll(XML_TEXT)].map((match) => match[1] ?? "").join(" ");
    const marks = latin1.match(FIXTURE_MARK) ?? [];
    return [...marks, xml].join("\n").trim();
  }
  return Buffer.from(bytes).toString("utf8").trim();
}

/** Wrap labeled sample text in a one-page PDF so repository uploads can carry a fixture id. */
export function textToMinimalPdf(text: string): Uint8Array {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped.slice(0, 8000)}) Tj ET`;
  const body = `%PDF-1.1
% ${fixtureIdFromText(text) ? `ACCORDIQ_FIXTURE:${fixtureIdFromText(text)}` : "sample"}
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${stream.length} >>
stream
${stream}
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`;
  return new TextEncoder().encode(body);
}
