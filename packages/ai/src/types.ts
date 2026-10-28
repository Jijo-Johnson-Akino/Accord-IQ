import type { AppConfig } from "@accordiq/core";
import type { ComparisonPayload, ExtractionPayload, QaPayload } from "./schemas";

export type LlmProviderName = AppConfig["LLM_PROVIDER"];

export interface LlmStatus {
  provider: LlmProviderName;
  available: boolean;
  synthetic: boolean;
  model: string | null;
  setup: string[];
}

export interface LlmAdapter {
  status(): LlmStatus;
  extract(input: { text: string; fileName: string }): Promise<ExtractionPayload>;
  answer(input: { text: string; question: string }): Promise<QaPayload>;
  compare(input: {
    leftText: string;
    rightText: string;
    leftName: string;
    rightName: string;
  }): Promise<ComparisonPayload>;
}
