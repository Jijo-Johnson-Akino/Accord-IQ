export const INTENT_LABELS: Record<string, string> = {
  ASK_CONTRACT: "Contract question",
  SEARCH_CONTRACTS: "Search",
  COMPARE_TERMS: "Compare terms",
  UPCOMING_COMMITMENTS: "Obligations and renewals",
  DRAFT_FROM_TEMPLATE: "Draft from playbook",
  EXPLAIN_POLICY: "Policy exception",
  NEGOTIATION_LANGUAGE: "Negotiation language",
  SUMMARIZE_CHANGES: "Summarize changes",
  AMBIGUOUS: "Needs a contract",
  UNSUPPORTED: "Out of scope",
  INJECTION: "Refused",
};

export const SUGGESTED_PROMPTS = [
  {
    label: "Search Acme agreements",
    message: "Search authorized contracts for Acme",
  },
  {
    label: "Upcoming obligations",
    message: "What obligations and renewals are upcoming?",
  },
  {
    label: "Governing law",
    message: "What is the governing law?",
  },
  {
    label: "Draft from playbook",
    message: "Draft a first version from approved templates",
  },
  {
    label: "Policy exception",
    message: "Explain any policy exception on this contract",
  },
  {
    label: "Negotiation language",
    message: "Suggest negotiation language from the playbook",
  },
] as const;
