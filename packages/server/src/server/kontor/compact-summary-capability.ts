import { compactSummaryLiveCompositionComposed } from "./compact-summary-live-composition.js";

/** Active owner when live compact summary generation is not available on this host build. */
export const COMPACT_SUMMARY_LIVE_CAPABILITY_OWNER =
  "@getpaseo/server Kontor host lane (ASMA-8539); live provider-run summarization is not composed on this host.";

/** Host may advertise and accept compact-summary RPCs (live composition and/or dev mock/test path). */
export function compactSummaryProviderRunEnabled(isDevBuild: boolean): boolean {
  return compactSummaryLiveCompositionComposed() || isDevBuild;
}
