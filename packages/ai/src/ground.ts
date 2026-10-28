import type { Citation, ComparisonPayload, ExtractionPayload, QaPayload } from "./schemas";

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function quoteInSource(quote: string, source: string): boolean {
  const needle = normalize(quote);
  if (needle.length < 8) return false;
  return normalize(source).includes(needle);
}

function keepCitation(citation: Citation | null, source: string): Citation | null {
  if (!citation) return null;
  return quoteInSource(citation.quote, source) ? citation : null;
}

function isoInSource(iso: string | null, source: string): boolean {
  if (!iso) return false;
  if (source.includes(iso)) return true;
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return false;
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthName = months[Number(month) - 1];
  if (!monthName) return false;
  const dayNum = String(Number(day));
  return normalize(source).includes(`${monthName} ${dayNum}, ${year}`);
}

const DATE_NEAR_END =
  /(?:expir(?:es|ation|ing)?|term ends|end date|ends on|through)[^\n.]{0,48}(20\d{2}-\d{2}-\d{2})/gi;

export function detectEndDateConflicts(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(DATE_NEAR_END)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function groundValue(
  field: ExtractionPayload["title"],
  source: string,
  kind: "text" | "date",
): ExtractionPayload["title"] {
  const citation = keepCitation(field.citation, source);
  let value = field.value;
  if (kind === "date" && value && !isoInSource(value, source)) {
    value = null;
  }
  if (!citation && kind === "text" && value && !normalize(source).includes(normalize(value))) {
    value = null;
  }
  const confidence = citation ? field.confidence : Math.min(field.confidence, value ? 0.4 : 0);
  return { value, confidence, citation };
}

/** Drop unverifiable quotes and dates. Never keep a citation that is not in the source. */
export function groundExtraction(payload: ExtractionPayload, source: string): ExtractionPayload {
  const endDates = detectEndDateConflicts(source);
  const conflicts = [...payload.conflicts];
  let endDate = groundValue(payload.endDate, source, "date");
  if (endDates.length > 1) {
    endDate = { value: null, confidence: 0, citation: null };
    if (!conflicts.some((row) => row.field === "END_DATE")) {
      conflicts.push({
        field: "END_DATE",
        message: `The document states more than one end date (${endDates.join(", ")}).`,
      });
    }
  }
  return {
    title: groundValue(payload.title, source, "text"),
    parties: payload.parties
      .map((party) => ({
        ...party,
        citation: keepCitation(party.citation, source),
        confidence: keepCitation(party.citation, source)
          ? party.confidence
          : Math.min(party.confidence, 0.4),
      }))
      .filter((party) => party.name.length > 0),
    startDate: groundValue(payload.startDate, source, "date"),
    endDate,
    renewalTerms: groundValue(payload.renewalTerms, source, "text"),
    governingLaw: groundValue(payload.governingLaw, source, "text"),
    jurisdiction: groundValue(payload.jurisdiction, source, "text"),
    contractValue: groundValue(payload.contractValue, source, "text"),
    currency: groundValue(payload.currency, source, "text"),
    paymentTerms: groundValue(payload.paymentTerms, source, "text"),
    summary: payload.summary,
    clauses: payload.clauses.map((clause) => ({
      ...clause,
      citation: keepCitation(clause.citation, source),
    })),
    obligations: payload.obligations.map((row) => ({
      ...row,
      dueOn:
        row.dueOn && isoInSource(row.dueOn, source)
          ? row.dueOn
          : row.dueOn && source.includes(row.dueOn)
            ? row.dueOn
            : null,
      citation: keepCitation(row.citation, source),
    })),
    conflicts,
  };
}

export function groundQa(payload: QaPayload, source: string): QaPayload {
  const citations = payload.citations.filter((citation) => quoteInSource(citation.quote, source));
  if (citations.length === 0) {
    return {
      answer: null,
      supported: false,
      refusalReason: payload.refusalReason ?? "No supporting quotation was found in the contract.",
      citations: [],
    };
  }
  if (!payload.supported) {
    return { ...payload, answer: null, citations };
  }
  return { ...payload, citations };
}

export function groundComparison(
  payload: ComparisonPayload,
  left: string,
  right: string,
): ComparisonPayload {
  return {
    summary: payload.summary,
    changes: payload.changes.map((change) => ({
      ...change,
      citationA: keepCitation(change.citationA, left),
      citationB: keepCitation(change.citationB, right),
    })),
  };
}
