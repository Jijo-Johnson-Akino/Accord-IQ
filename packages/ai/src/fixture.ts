import { AppError } from "@accordiq/core";
import { COMPARE_CASE, fixtureById, QA_CASES } from "./fixtures";
import { groundComparison, groundExtraction, groundQa } from "./ground";
import { fixtureIdFromText } from "./text";
import type { LlmAdapter } from "./types";

const MODEL = "accordiq-fixture-v1";

export function createFixtureAdapter(): LlmAdapter {
  return {
    status() {
      return {
        provider: "fixture",
        available: true,
        synthetic: true,
        model: MODEL,
        setup: [
          "LLM_PROVIDER=fixture is a labeled-sample evaluator, not a live model.",
          "Upload a document that contains an ACCORDIQ_FIXTURE marker, or connect openai/anthropic.",
        ],
      };
    },
    async extract({ text }) {
      const id = fixtureIdFromText(text);
      const fixture = id ? fixtureById(id) : null;
      if (!fixture) {
        throw new AppError(
          "VALIDATION",
          "The synthetic fixture provider only analyzes labeled sample documents.",
        );
      }
      return groundExtraction(fixture.expected, fixture.text);
    },
    async answer({ text, question }) {
      const id = fixtureIdFromText(text);
      const match = QA_CASES.find(
        (row) =>
          row.fixtureId === id && row.question.toLowerCase() === question.trim().toLowerCase(),
      );
      if (match) return groundQa(match.expected, text);
      return groundQa(
        {
          answer: null,
          supported: false,
          refusalReason: "The synthetic provider has no labeled answer for this question.",
          citations: [],
        },
        text,
      );
    },
    async compare({ leftText, rightText }) {
      const leftId = fixtureIdFromText(leftText);
      const rightId = fixtureIdFromText(rightText);
      if (leftId === COMPARE_CASE.leftId && rightId === COMPARE_CASE.rightId) {
        return groundComparison(COMPARE_CASE.expected, leftText, rightText);
      }
      throw new AppError(
        "VALIDATION",
        "The synthetic fixture provider only compares the labeled complete-msa and amended-msa samples.",
      );
    },
  };
}
