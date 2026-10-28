export const ASSISTANT_INTENTS = [
  "ASK_CONTRACT",
  "SEARCH_CONTRACTS",
  "COMPARE_TERMS",
  "UPCOMING_COMMITMENTS",
  "DRAFT_FROM_TEMPLATE",
  "EXPLAIN_POLICY",
  "NEGOTIATION_LANGUAGE",
  "SUMMARIZE_CHANGES",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "INJECTION",
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|these)\s+instructions/i,
  /you\s+are\s+now\b/i,
  /grant\s+me\s+(admin|superadmin|[a-z]+:[a-z]+|permission)/i,
  /override\s+(the\s+)?(system|rbac|permission|access)/i,
  /make\s+me\s+(an?\s+)?(org(anization)?\s+)?admin/i,
  /skip\s+(the\s+)?confirmation/i,
  /disable\s+(access\s+)?control/i,
  /\bjailbreak\b/i,
  /pretend\s+you\s+have\s+permission/i,
  /system:\s*you\s+must/i,
];

const UNSUPPORTED_PATTERNS = [
  /\bwhat(?:'s| is) the weather\b/i,
  /\btell me a joke\b/i,
  /\bwhat(?:'s| is) my password\b/i,
];

export function detectInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(message));
}

export function searchQueryFromMessage(message: string): string | undefined {
  const stripped = message
    .replace(
      /^(please\s+)?(search|find|list|show me)\s+(for\s+)?(authorized\s+)?(contracts?|agreements?)?\s*(for|matching|named)?\s*/i,
      "",
    )
    .replace(/[?.!]+$/g, "")
    .trim();
  if (!stripped || stripped.length < 2) return undefined;
  return stripped.slice(0, 200);
}

export function classifyIntent(input: {
  message: string;
  contractId?: string | null;
  leftContractId?: string | null;
  rightContractId?: string | null;
}): AssistantIntent {
  const text = input.message.trim();
  if (!text) return "AMBIGUOUS";
  if (detectInjection(text)) return "INJECTION";
  if (UNSUPPORTED_PATTERNS.some((pattern) => pattern.test(text))) return "UNSUPPORTED";
  if (/\b(draft|first version|from (the )?approved templates?|playbook draft)\b/i.test(text)) {
    return "DRAFT_FROM_TEMPLATE";
  }
  if (
    /\b(negotiat\w*|fallback language|alternative language|suggest(?:ed)? (?:negotiation )?language)\b/i.test(
      text,
    )
  ) {
    return "NEGOTIATION_LANGUAGE";
  }
  if (/\b(policy exception|playbook exception|deviat(?:e|ion)|non-standard clause)\b/i.test(text)) {
    return "EXPLAIN_POLICY";
  }
  if (
    /\b(upcoming|renewals?|obligations?(?:\s+due)?|what is due|due (soon|dates?)|expir(?:y|ing|es) soon)\b/i.test(
      text,
    )
  ) {
    return "UPCOMING_COMMITMENTS";
  }
  if (/\bsummarize\s+(the\s+)?changes\b/i.test(text) || /\bchanged terms\b/i.test(text)) {
    return "SUMMARIZE_CHANGES";
  }
  if (/\b(compare|difference(?:s)? between|diff the)\b/i.test(text)) {
    return "COMPARE_TERMS";
  }
  if (/\b(search|find|list|show me|which agreements?|authorized contracts)\b/i.test(text)) {
    return "SEARCH_CONTRACTS";
  }
  if (input.leftContractId && input.rightContractId) return "COMPARE_TERMS";
  if (input.contractId) return "ASK_CONTRACT";
  if (/\b(governing law|what is the|term of this|value of this)\b/i.test(text)) {
    return "AMBIGUOUS";
  }
  return "AMBIGUOUS";
}
