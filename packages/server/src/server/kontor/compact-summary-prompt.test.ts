import { describe, expect, test } from "vitest";
import {
  buildCompactSummaryProviderPrompt,
  KONTOR_COMPACT_SUMMARY_PROMPT_MARKER,
  parseCompactSummarySectionsJson,
} from "./compact-summary-prompt.js";

describe("compact summary prompt", () => {
  test("builds a marked provider prompt with metadata and bounded activity excerpt", () => {
    const prompt = buildCompactSummaryProviderPrompt({
      agent: {
        id: "00000000-0000-4000-8000-000000000010",
        title: "Disposable test session",
        status: "idle",
        provider: "mock/five-minute-stream",
        updatedAt: "2026-10-25T09:00:00.000Z",
        lastUserMessageAt: "2026-10-25T10:00:00.000Z",
        activeTurnStartedAt: null,
      },
      cutoff: "2026-10-25T10:00:00.000Z",
      activityExcerpt: "Showing 1 of 1 activities\n\n[Assistant] hello",
    });
    expect(prompt).toContain(KONTOR_COMPACT_SUMMARY_PROMPT_MARKER);
    expect(prompt).toContain("Disposable test session");
    expect(prompt).toContain("[Assistant] hello");
  });

  test("parses provider JSON sections", () => {
    expect(
      parseCompactSummarySectionsJson(
        JSON.stringify({
          task: "t",
          decisions: "d",
          currentState: "c",
          nextStep: "n",
        }),
      ),
    ).toEqual({ task: "t", decisions: "d", currentState: "c", nextStep: "n" });
  });
});
