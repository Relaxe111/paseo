import {
  CompactSummaryGenerationStore,
  type StoredCompactSummaryGeneration,
} from "./compact-summary-generation-store.js";
import type { CompactSummaryProviderRunner } from "./compact-summary-provider-run.js";
import { compactSummaryLiveProviderEligible } from "./compact-summary-live-composition.js";

export interface CompactSummarySections {
  task: string;
  decisions: string;
  currentState: string;
  nextStep: string;
}

export interface CompactSummaryAgentView {
  id: string;
  title: string | null;
  status: string;
  provider: string;
  updatedAt: string;
  lastUserMessageAt: string | null;
  activeTurnStartedAt: string | null;
}

export const COMPACT_SUMMARY_FAKE_TEST_PROVIDER_IDS = new Set(["mock", "test"]);

const generationTails = new Map<string, Promise<unknown>>();

export function compactSummaryTestProviderEligible(provider: string, isDevBuild: boolean): boolean {
  if (!isDevBuild) {
    return false;
  }
  return COMPACT_SUMMARY_FAKE_TEST_PROVIDER_IDS.has(compactSummaryProviderBaseId(provider));
}

function withAgentGenerationLock<T>(agentId: string, work: () => Promise<T>): Promise<T> {
  const tail = generationTails.get(agentId) ?? Promise.resolve();
  const run = tail.catch(() => undefined).then(work);
  generationTails.set(agentId, run);
  return run.finally(() => {
    if (generationTails.get(agentId) === run) generationTails.delete(agentId);
  });
}

export function compactSummaryProviderBaseId(provider: string): string {
  return provider.split("/")[0]?.trim().toLowerCase() ?? "";
}

export function compactSummaryProviderEligible(provider: string, isDevBuild: boolean): boolean {
  return (
    compactSummaryTestProviderEligible(provider, isDevBuild) ||
    compactSummaryLiveProviderEligible(provider)
  );
}

/** Latest source event the summary may cover; metadata only, no transcript scan. */
export function compactSummaryCutoffOf(agent: CompactSummaryAgentView): string {
  const candidates = [agent.activeTurnStartedAt, agent.lastUserMessageAt].filter(
    (value): value is string => !!value && Number.isFinite(Date.parse(value)),
  );
  if (candidates.length > 0) {
    return candidates.sort().at(-1)!;
  }
  return agent.updatedAt;
}

export class CompactSummaryGenerator {
  constructor(
    private readonly store: CompactSummaryGenerationStore,
    private readonly providerRunner: CompactSummaryProviderRunner,
  ) {}

  generate(
    agent: CompactSummaryAgentView,
  ): Promise<{ sections: CompactSummarySections; cutoff: string }> {
    const cutoff = compactSummaryCutoffOf(agent).trim();
    if (!cutoff) {
      return Promise.reject(new Error("The host could not determine a summary cutoff timestamp."));
    }
    return withAgentGenerationLock(agent.id, async () => {
      this.providerRunner.assertProviderSupported(agent.provider);
      const existing = await this.store.read(agent.id);
      if (existing?.cutoff === cutoff) {
        return { sections: existing.sections, cutoff: existing.cutoff };
      }
      const sections = await this.providerRunner.generateSections(agent);
      const revision = (existing?.revision ?? 0) + 1;
      const record: StoredCompactSummaryGeneration = {
        revision,
        cutoff,
        sections,
        savedAt: new Date().toISOString(),
      };
      await this.store.write(agent.id, record);
      return { sections, cutoff };
    });
  }
}
