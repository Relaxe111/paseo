import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import pino from "pino";
import { CompactSummaryGenerationStore } from "./compact-summary-generation-store.js";
import {
  CompactSummaryGenerator,
  compactSummaryCutoffOf,
  type CompactSummaryAgentView,
  type CompactSummarySections,
} from "./compact-summary-generator.js";
import {
  COMPACT_SUMMARY_LIVE_PROVIDER_GAP,
  CompactSummaryProviderRunner,
} from "./compact-summary-provider-run.js";

const agentId = "00000000-0000-4000-8000-000000000010";

function agent(overrides: Partial<CompactSummaryAgentView> = {}): CompactSummaryAgentView {
  return {
    id: agentId,
    title: "Review parser",
    status: "idle",
    provider: "mock/five-minute-stream",
    updatedAt: "2026-10-25T09:00:00.000Z",
    lastUserMessageAt: "2026-10-25T10:00:00.000Z",
    activeTurnStartedAt: null,
    ...overrides,
  };
}

const SECTIONS: CompactSummarySections = {
  task: "Ship parser fix",
  decisions: "Use provider-run JSON",
  currentState: "Idle",
  nextStep: "Review",
};

function stubRunner(
  impl: Pick<CompactSummaryProviderRunner, "generateSections" | "canRunOnHost">,
): CompactSummaryProviderRunner {
  return { assertProviderSupported: () => {}, ...impl } as CompactSummaryProviderRunner;
}

describe("compact summary generator", () => {
  test("cutoff prefers the latest prompt or turn start without reading a transcript", () => {
    expect(compactSummaryCutoffOf(agent())).toBe("2026-10-25T10:00:00.000Z");
    expect(
      compactSummaryCutoffOf(
        agent({
          lastUserMessageAt: "2026-10-25T10:00:00.000Z",
          activeTurnStartedAt: "2026-10-25T10:30:00.000Z",
        }),
      ),
    ).toBe("2026-10-25T10:30:00.000Z");
  });

  test("persists revision/cutoff and reuses the same payload after restart when cutoff is unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "compact-summary-gen-"));
    const firstStore = new CompactSummaryGenerationStore(
      join(root, "compact-summary-generation-v1"),
    );
    const first = new CompactSummaryGenerator(
      firstStore,
      stubRunner({ canRunOnHost: () => true, generateSections: async () => SECTIONS }),
    );
    const initial = await first.generate(agent());
    expect(initial.cutoff).toBe("2026-10-25T10:00:00.000Z");

    const restarted = new CompactSummaryGenerator(
      new CompactSummaryGenerationStore(join(root, "compact-summary-generation-v1")),
      stubRunner({ canRunOnHost: () => true, generateSections: async () => SECTIONS }),
    );
    const again = await restarted.generate(agent());
    expect(again).toEqual(initial);

    const stored = await firstStore.read(agentId);
    expect(stored?.revision).toBe(1);
  });

  test("bumps revision when cutoff advances", async () => {
    const root = await mkdtemp(join(tmpdir(), "compact-summary-gen-"));
    const store = new CompactSummaryGenerationStore(join(root, "compact-summary-generation-v1"));
    const generator = new CompactSummaryGenerator(
      store,
      stubRunner({
        canRunOnHost: () => true,
        generateSections: async (view) => ({
          ...SECTIONS,
          task: view.lastUserMessageAt === "2026-10-25T11:00:00.000Z" ? "Later" : SECTIONS.task,
        }),
      }),
    );
    await generator.generate(agent());
    const next = await generator.generate(agent({ lastUserMessageAt: "2026-10-25T11:00:00.000Z" }));
    expect(next.cutoff).toBe("2026-10-25T11:00:00.000Z");
    expect((await store.read(agentId))?.revision).toBe(2);
  });

  test("refuses live providers with a truthful gap", async () => {
    const root = await mkdtemp(join(tmpdir(), "compact-summary-gen-"));
    const generator = new CompactSummaryGenerator(
      new CompactSummaryGenerationStore(join(root, "compact-summary-generation-v1")),
      stubRunner({
        canRunOnHost: () => true,
        generateSections: async () => {
          throw new Error(COMPACT_SUMMARY_LIVE_PROVIDER_GAP);
        },
      }),
    );
    await expect(
      generator.generate(agent({ provider: "claude/claude-test-model" })),
    ).rejects.toThrow(COMPACT_SUMMARY_LIVE_PROVIDER_GAP);
  });
  test("refuses an unsupported production provider even when a generation is cached", async () => {
    const root = await mkdtemp(join(tmpdir(), "compact-summary-refusal-"));
    const store = new CompactSummaryGenerationStore(root);
    await store.write(agentId, {
      revision: 1,
      cutoff: compactSummaryCutoffOf(agent()),
      sections: SECTIONS,
      savedAt: agent().updatedAt,
    });
    const runner = new CompactSummaryProviderRunner({
      isDevBuild: false,
      agentManager: {
        runAgent: async () => {
          throw new Error("must not run");
        },
        getTimeline: () => [],
      },
      agentStorage: {} as never,
      logger: pino({ level: "silent" }),
    });
    await expect(
      new CompactSummaryGenerator(store, runner).generate(agent({ provider: "claude/model" })),
    ).rejects.toThrow(COMPACT_SUMMARY_LIVE_PROVIDER_GAP);
    expect((await store.read(agentId))?.revision).toBe(1);
  });
});
