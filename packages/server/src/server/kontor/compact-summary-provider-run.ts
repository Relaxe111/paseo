import type pino from "pino";
import { summarizeAgentActivity } from "../agent/activity-curator.js";
import type { AgentTimelineItem } from "../agent/agent-sdk-types.js";
import { ensureAgentLoaded } from "../agent/agent-loading.js";
import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentStorage } from "../agent/agent-storage.js";
import {
  COMPACT_SUMMARY_LIVE_CAPABILITY_OWNER,
  compactSummaryProviderRunEnabled,
} from "./compact-summary-capability.js";
import {
  buildCompactSummaryProviderPrompt,
  COMPACT_SUMMARY_ACTIVITY_TAIL_LIMIT,
  COMPACT_SUMMARY_SECTIONS_JSON_SCHEMA,
  parseCompactSummarySectionsJson,
} from "./compact-summary-prompt.js";
import { compactSummaryLiveProviderEligible } from "./compact-summary-live-composition.js";
import {
  compactSummaryCutoffOf,
  compactSummaryProviderBaseId,
  compactSummaryProviderEligible,
  type CompactSummaryAgentView,
  type CompactSummarySections,
} from "./compact-summary-generator.js";

export const COMPACT_SUMMARY_LIVE_PROVIDER_GAP = `Compact session summary generation is not available for this session provider on this host build. Owner: ${COMPACT_SUMMARY_LIVE_CAPABILITY_OWNER}`;

export interface CompactSummaryProviderRunDeps {
  isDevBuild: boolean;
  agentManager: Pick<AgentManager, "runAgent" | "getTimeline">;
  agentStorage: AgentStorage;
  logger: pino.Logger;
}

function readBoundedActivityExcerpt(timeline: AgentTimelineItem[]): string {
  return summarizeAgentActivity(timeline, COMPACT_SUMMARY_ACTIVITY_TAIL_LIMIT).content;
}

export class CompactSummaryProviderRunner {
  constructor(private readonly deps: CompactSummaryProviderRunDeps) {}

  canRunOnHost(): boolean {
    return compactSummaryProviderRunEnabled(this.deps.isDevBuild);
  }

  assertProviderSupported(provider: string): void {
    if (!this.canRunOnHost()) {
      throw new Error(COMPACT_SUMMARY_LIVE_PROVIDER_GAP);
    }
    if (!compactSummaryProviderEligible(provider, this.deps.isDevBuild)) {
      throw new Error(
        `${COMPACT_SUMMARY_LIVE_PROVIDER_GAP} This session uses provider "${provider}".`,
      );
    }
  }

  async generateSections(agent: CompactSummaryAgentView): Promise<CompactSummarySections> {
    this.assertProviderSupported(agent.provider);
    await ensureAgentLoaded(agent.id, {
      agentManager: this.deps.agentManager as unknown as AgentManager,
      agentStorage: this.deps.agentStorage,
      logger: this.deps.logger,
    });
    const cutoff = compactSummaryCutoffOf(agent).trim();
    const timeline = this.deps.agentManager.getTimeline(agent.id);
    const activityExcerpt = readBoundedActivityExcerpt(timeline);
    const prompt = buildCompactSummaryProviderPrompt({ agent, cutoff, activityExcerpt });
    const runOptions = compactSummaryLiveProviderEligible(agent.provider)
      ? { outputSchema: COMPACT_SUMMARY_SECTIONS_JSON_SCHEMA }
      : undefined;
    const result = await this.deps.agentManager.runAgent(agent.id, prompt, runOptions);
    if (result.canceled) {
      throw new Error("Compact summary generation was canceled before the provider finished.");
    }
    const sections = parseCompactSummarySectionsJson(result.finalText);
    this.deps.logger.debug(
      {
        agentId: agent.id,
        provider: compactSummaryProviderBaseId(agent.provider),
        cutoff,
      },
      "kontor compact summary provider-run completed",
    );
    return sections;
  }
}
