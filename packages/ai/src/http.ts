import { AppError, parseInput } from "@accordiq/core";
import type { ZodType } from "zod";
import {
  COMPARE_SYSTEM,
  EXTRACTION_SYSTEM,
  QA_SYSTEM,
  compareUserPrompt,
  extractionUserPrompt,
  qaUserPrompt,
  wrapUntrustedDocument,
} from "./sanitize";
import { comparisonSchema, extractionSchema, qaSchema } from "./schemas";
import { groundComparison, groundExtraction, groundQa } from "./ground";
import type { LlmAdapter } from "./types";

export interface HttpLlmOptions {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

function providerError(status: number, provider: string): AppError {
  if (status === 401 || status === 403) {
    return new AppError("VALIDATION", "The AI provider rejected the credentials.");
  }
  if (status === 429) {
    return new AppError(
      "VALIDATION",
      "The AI provider rate-limited this request. Try again shortly.",
    );
  }
  if (status >= 500) {
    return new AppError("VALIDATION", "The AI provider is unavailable.");
  }
  return new AppError("VALIDATION", `${provider} returned HTTP ${status}.`);
}

function parseJsonContent<T>(raw: string, schema: ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION", "The AI provider returned a response that was not JSON.");
  }
  return parseInput(schema, parsed);
}

async function postOpenAi(options: HttpLlmOptions, system: string, user: string): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AppError("VALIDATION", "The AI provider timed out.");
    }
    throw new AppError("VALIDATION", "The AI provider could not be reached.");
  }
  if (!response.ok) throw providerError(response.status, "openai");
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new AppError("VALIDATION", "The AI provider returned an empty completion.");
  }
  return content;
}

async function postAnthropic(
  options: HttpLlmOptions,
  system: string,
  user: string,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 4096,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new AppError("VALIDATION", "The AI provider timed out.");
    }
    throw new AppError("VALIDATION", "The AI provider could not be reached.");
  }
  if (!response.ok) throw providerError(response.status, "anthropic");
  const body = (await response.json()) as { content?: { type?: string; text?: string }[] };
  const content = body.content?.find((part) => part.type === "text")?.text;
  if (!content) {
    throw new AppError("VALIDATION", "The AI provider returned an empty completion.");
  }
  return content;
}

async function complete(options: HttpLlmOptions, system: string, user: string): Promise<string> {
  return options.provider === "openai"
    ? postOpenAi(options, system, user)
    : postAnthropic(options, system, user);
}

export function createHttpAdapter(options: HttpLlmOptions): LlmAdapter {
  return {
    status() {
      return {
        provider: options.provider,
        available: true,
        synthetic: false,
        model: options.model,
        setup: [],
      };
    },
    async extract({ text, fileName }) {
      const wrapped = wrapUntrustedDocument(text);
      const raw = await complete(
        options,
        EXTRACTION_SYSTEM,
        extractionUserPrompt(wrapped, fileName),
      );
      const parsed = await parseJsonContent(raw, extractionSchema);
      return groundExtraction(parsed, text);
    },
    async answer({ text, question }) {
      const wrapped = wrapUntrustedDocument(text);
      const raw = await complete(options, QA_SYSTEM, qaUserPrompt(wrapped, question));
      const parsed = await parseJsonContent(raw, qaSchema);
      return groundQa(parsed, text);
    },
    async compare({ leftText, rightText, leftName, rightName }) {
      const raw = await complete(
        options,
        COMPARE_SYSTEM,
        compareUserPrompt(
          wrapUntrustedDocument(leftText),
          wrapUntrustedDocument(rightText),
          leftName,
          rightName,
        ),
      );
      const parsed = await parseJsonContent(raw, comparisonSchema);
      return groundComparison(parsed, leftText, rightText);
    },
  };
}
