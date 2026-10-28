import { AppError } from "@accordiq/core";
import type { LlmAdapter, LlmStatus } from "./types";

export const NONE_SETUP = [
  "Copy .env.example to .env.local (or apps/web/.env.local).",
  "For labeled sample documents only, set LLM_PROVIDER=fixture. This is not a live model.",
  "For a live provider, set LLM_PROVIDER=openai or LLM_PROVIDER=anthropic and LLM_API_KEY.",
  "Restart the app. The API key is never shown in the UI.",
];

export function noneStatus(): LlmStatus {
  return {
    provider: "none",
    available: false,
    synthetic: false,
    model: null,
    setup: NONE_SETUP,
  };
}

export function createNoneAdapter(): LlmAdapter {
  const status = noneStatus();
  const unavailable = async () => {
    throw new AppError(
      "VALIDATION",
      "AI is not connected. Set LLM_PROVIDER to fixture, openai, or anthropic.",
    );
  };
  return {
    status: () => status,
    extract: unavailable,
    answer: unavailable,
    compare: unavailable,
  };
}
