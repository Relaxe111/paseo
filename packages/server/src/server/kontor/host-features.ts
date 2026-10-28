import { compactSummaryProviderRunEnabled } from "./compact-summary-capability.js";

export function buildKontorHostFeatures(input: { isDevBuild: boolean }) {
  return { agentCompactSummary: compactSummaryProviderRunEnabled(input.isDevBuild) } as const;
}
