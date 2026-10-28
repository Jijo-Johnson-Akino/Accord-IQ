export const MINIMAL_PDF = new TextEncoder().encode(`%PDF-1.1
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`);

/** ZIP magic plus a `word/` path in the first bytes — enough for the Phase 6 structural gate. */
export const MINIMAL_DOCX = Uint8Array.from([
  0x50,
  0x4b,
  0x03,
  0x04,
  ...new TextEncoder().encode("word/document.xml"),
]);
