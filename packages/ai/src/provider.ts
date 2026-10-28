import type { AppConfig } from "@accordiq/core";
import { createFixtureAdapter } from "./fixture";
import { createHttpAdapter } from "./http";
import { createNoneAdapter } from "./none";
import type { LlmAdapter } from "./types";

const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-3-5-haiku-latest";

export function createLlm(
  config: Pick<AppConfig, "LLM_PROVIDER" | "LLM_API_KEY" | "LLM_MODEL" | "LLM_TIMEOUT_MS">,
  options: { fetchImpl?: typeof fetch } = {},
): LlmAdapter {
  if (config.LLM_PROVIDER === "none") return createNoneAdapter();
  if (config.LLM_PROVIDER === "fixture") return createFixtureAdapter();
  const model =
    config.LLM_MODEL ?? (config.LLM_PROVIDER === "openai" ? OPENAI_MODEL : ANTHROPIC_MODEL);
  return createHttpAdapter({
    provider: config.LLM_PROVIDER,
    apiKey: config.LLM_API_KEY ?? "",
    model,
    timeoutMs: config.LLM_TIMEOUT_MS,
    fetchImpl: options.fetchImpl,
  });
}
