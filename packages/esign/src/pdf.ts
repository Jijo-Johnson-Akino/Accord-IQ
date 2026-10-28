/** Minimal one-page PDF. Used for sandbox completion evidence, not as a legal signature image. */
export function textToMinimalPdf(text: string): Uint8Array {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped.slice(0, 8000)}) Tj ET`;
  const body = `%PDF-1.1
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

export function sandboxCertificatePdf(input: {
  envelopeId: string;
  providerEnvelopeId: string;
  contractId: string;
  versionId: string;
  signers: Array<{ name: string; email: string; signedAt?: string }>;
}): Uint8Array {
  const lines = [
    "SANDBOX COMPLETION EVIDENCE — NOT A LEGALLY BINDING SIGNATURE.",
    "AccordIQ test-only adapter. Do not treat this file as executed contract evidence.",
    `Envelope ${input.envelopeId}`,
    `Provider envelope ${input.providerEnvelopeId}`,
    `Contract ${input.contractId}`,
    `Version ${input.versionId}`,
    ...input.signers.map(
      (signer) =>
        `${signer.name} <${signer.email}> ${signer.signedAt ? `recorded ${signer.signedAt}` : "not recorded"}`,
    ),
  ];
  return textToMinimalPdf(lines.join(" | "));
}
