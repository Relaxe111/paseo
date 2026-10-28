/**
 * Production compact-summary provider-run composition (R28).
 * Live routes use {@link AgentRunOptions.outputSchema} plus host-side JSON parsing;
 * mock/test providers stay dev-only and recognize {@link KONTOR_COMPACT_SUMMARY_PROMPT_MARKER}.
 */

/** Provider base ids whose runAgent path forwards outputSchema to the model (verified in-server). */
export const COMPACT_SUMMARY_LIVE_PROVIDER_BASE_IDS = new Set(["codex", "opencode"]);

/** True when the host lane exposes a bounded prompt + structured run + four-section parse (not a placeholder). */
export function compactSummaryLiveCompositionComposed(): boolean {
  return COMPACT_SUMMARY_LIVE_PROVIDER_BASE_IDS.size > 0;
}

export function compactSummaryLiveProviderEligible(provider: string): boolean {
  if (!compactSummaryLiveCompositionComposed()) {
    return false;
  }
  const base = provider.split("/")[0]?.trim().toLowerCase() ?? "";
  return COMPACT_SUMMARY_LIVE_PROVIDER_BASE_IDS.has(base);
}
