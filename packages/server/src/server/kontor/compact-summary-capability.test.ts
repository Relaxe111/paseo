import { describe, expect, test } from "vitest";
import { compactSummaryProviderRunEnabled } from "./compact-summary-capability.js";
import { buildKontorHostFeatures } from "./host-features.js";

describe("compact summary capability", () => {
  test("advertises agentCompactSummary on production when live composition exists", () => {
    expect(compactSummaryProviderRunEnabled(false)).toBe(true);
    expect(buildKontorHostFeatures({ isDevBuild: false }).agentCompactSummary).toBe(true);
  });

  test("dev build also enables mock/test path via the same host feature", () => {
    expect(compactSummaryProviderRunEnabled(true)).toBe(true);
    expect(buildKontorHostFeatures({ isDevBuild: true }).agentCompactSummary).toBe(true);
  });
});
