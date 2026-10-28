import { describe, expect, test } from "vitest";
import {
  compactSummaryLiveCompositionComposed,
  compactSummaryLiveProviderEligible,
} from "./compact-summary-live-composition.js";
import {
  compactSummaryProviderEligible,
  compactSummaryTestProviderEligible,
} from "./compact-summary-generator.js";

describe("compact summary live composition", () => {
  test("composition is composed for codex and opencode structured runs", () => {
    expect(compactSummaryLiveCompositionComposed()).toBe(true);
    expect(compactSummaryLiveProviderEligible("codex/gpt-5.4-mini")).toBe(true);
    expect(compactSummaryLiveProviderEligible("opencode/claude-sonnet")).toBe(true);
    expect(compactSummaryLiveProviderEligible("claude/claude-3")).toBe(false);
  });

  test("mock/test eligibility is dev-build only", () => {
    expect(compactSummaryTestProviderEligible("mock/five-minute-stream", true)).toBe(true);
    expect(compactSummaryTestProviderEligible("mock/five-minute-stream", false)).toBe(false);
  });

  test("production eligibility is live providers only", () => {
    expect(compactSummaryProviderEligible("mock/five-minute-stream", false)).toBe(false);
    expect(compactSummaryProviderEligible("codex/gpt-5.4-mini", false)).toBe(true);
  });
});
