import { mkdtempSync, rmSync } from "node:fs";
import { AgentManager } from "../agent-manager.js";
import { AgentStorage } from "../agent-storage.js";
import { CompactSummaryProviderRunner } from "../../kontor/compact-summary-provider-run.js";
import {
  CompactSummaryGenerator,
  type CompactSummaryAgentView,
} from "../../kontor/compact-summary-generator.js";
import { CompactSummaryGenerationStore } from "../../kontor/compact-summary-generation-store.js";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";

import type { AgentStreamEvent } from "../agent-sdk-types.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import {
  canRunRealProvider,
  createRealProviderClient,
  getRealProviderConfig,
} from "../../daemon-e2e/real-provider-test-config.js";
import { CodexAppServerAgentClient } from "./codex-app-server-agent.js";

describe("Codex app-server provider (real)", () => {
  let canRunOpenRouter = false;

  beforeAll(async () => {
    canRunOpenRouter = await canRunRealProvider("codex");
  });

  test("lists models and runs a simple prompt", async (context) => {
    if (!canRunOpenRouter) {
      context.skip();
    }
    const client = createRealProviderClient("codex", createTestLogger());
    const cwd = mkdtempSync(path.join(os.tmpdir(), "codex-app-server-e2e-"));
    try {
      const { models } = await client.fetchCatalog({ scope: "workspace", cwd, force: false });
      expect(models.length).toBeGreaterThan(0);
      const session = await client.createSession({
        ...getRealProviderConfig("codex"),
        cwd,
        modeId: "auto",
      });
      try {
        expect(session.features?.some((feature) => feature.id === "plan_mode")).toBe(true);

        const result = await session.run("Say hello in one sentence.");
        expect(result.finalText.length).toBeGreaterThan(0);
      } finally {
        await session.close();
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("keeps a real MultiAgentV2 child inside its parent turn", async () => {
    const client = new CodexAppServerAgentClient(createTestLogger());
    const cwd = mkdtempSync(path.join(os.tmpdir(), "codex-multi-agent-v2-e2e-"));
    try {
      const { models } = await client.fetchCatalog({ scope: "workspace", cwd, force: false });
      const model = models.find((candidate) => candidate.isDefault) ?? models[0];
      if (!model) {
        throw new Error("Native Codex app-server returned no models");
      }
      const session = await client.createSession({
        provider: "codex",
        modeId: "full-access",
        model: model.id,
        cwd,
        thinkingOptionId: "medium",
        providerOptions: { features: { multi_agent_v2: true } },
      });
      const events: AgentStreamEvent[] = [];
      const unsubscribe = session.subscribe((event) => events.push(event));

      try {
        const result = await session.run(`
Use collaboration.spawn_agent exactly once with task_name "sentinel_child", fork_turns "none",
and this task: "Reply with exactly CHILD_SENTINEL and do nothing else."
Wait for that child to finish with collaboration.wait_agent. Do not emit any assistant text before
the child finishes. After it finishes, reply with exactly ROOT_SENTINEL. Never repeat
CHILD_SENTINEL in your own response.
`);

        const completedChildIndex = events.findIndex(
          (event) =>
            event.type === "timeline" &&
            event.item.type === "tool_call" &&
            event.item.status === "completed" &&
            event.item.detail.type === "sub_agent" &&
            event.item.detail.log.includes("CHILD_SENTINEL"),
        );
        const rootMessageIndexes = events.flatMap((event, index) =>
          event.type === "timeline" && event.item.type === "assistant_message" ? [index] : [],
        );
        const terminalIndexes = events.flatMap((event, index) =>
          event.type === "turn_completed" ||
          event.type === "turn_failed" ||
          event.type === "turn_canceled"
            ? [index]
            : [],
        );

        expect(result.finalText.trim()).toBe("ROOT_SENTINEL");
        expect(
          result.timeline.findLast(
            (item) => item.type === "tool_call" && item.detail.type === "sub_agent",
          ),
        ).toMatchObject({ status: "completed" });
        const topLevelAssistantText = result.timeline
          .filter((item) => item.type === "assistant_message")
          .map((item) => item.text)
          .join("");
        expect(topLevelAssistantText).not.toContain("CHILD_SENTINEL");
        expect(completedChildIndex).toBeGreaterThanOrEqual(0);
        expect(rootMessageIndexes[0]).toBeGreaterThan(completedChildIndex);
        expect(terminalIndexes).toHaveLength(1);
        expect(terminalIndexes[0]).toBeGreaterThan(rootMessageIndexes.at(-1) ?? -1);
      } finally {
        unsubscribe();
        await session.close();
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 300_000);
});

test("R28 generates and persists a real Codex summary for the exact source session", async () => {
  const logger = createTestLogger();
  const root = mkdtempSync(path.join(os.tmpdir(), "r28-real-summary-"));
  const client = new CodexAppServerAgentClient(logger);
  const storage = new AgentStorage(path.join(root, "agents"), logger);
  const manager = new AgentManager({ clients: { codex: client }, registry: storage, logger });
  let agentId: string | undefined;
  try {
    const { models } = await client.fetchCatalog({ scope: "workspace", cwd: root, force: false });
    const model = models.find((candidate) => candidate.isDefault) ?? models[0];
    if (!model) throw new Error("Codex returned no model for R28 generation");
    const source = await manager.createAgent(
      { provider: "codex", model: model.id, cwd: root, modeId: "read-only" },
      undefined,
      { workspaceId: undefined },
    );
    agentId = source.id;
    const seedRun = manager.runAgent(
      source.id,
      "Do not use tools. We are preparing the R28 summary feature. Decision: preserve the session UUID and save four sections. Current state: implementation is ready for review. Next step: reviewer checks installed readback. Acknowledge in one sentence.",
    );
    await manager.waitForAgentRunStart(source.id);
    const runner = new CompactSummaryProviderRunner({
      isDevBuild: false,
      agentManager: manager,
      agentStorage: storage,
      logger,
    });
    await expect(
      runner.generateSections({
        id: source.id,
        title: "R28 busy source",
        provider: `codex/${model.id}`,
        status: "running",
        updatedAt: new Date().toISOString(),
        lastUserMessageAt: null,
        activeTurnStartedAt: null,
      }),
    ).rejects.toThrow("already has an active run");
    await seedRun;
    const live = manager.getAgent(source.id)!;
    const view: CompactSummaryAgentView = {
      id: source.id,
      title: "R28 real source",
      provider: `codex/${model.id}`,
      status: "idle",
      updatedAt: live.updatedAt.toISOString(),
      lastUserMessageAt: live.lastUserMessageAt?.toISOString() ?? null,
      activeTurnStartedAt: null,
    };
    const dir = path.join(root, "kontor", "compact-summary-generation-v1");
    const generator = new CompactSummaryGenerator(new CompactSummaryGenerationStore(dir), runner);
    const generated = await generator.generate(view);
    for (const section of Object.values(generated.sections))
      expect(section.trim().length).toBeGreaterThan(0);
    expect(JSON.stringify(generated.sections)).toContain("R28");
    await manager.closeAgent(source.id);
    const restartedStore = new CompactSummaryGenerationStore(dir);
    const restarted = new CompactSummaryGenerator(restartedStore, runner);
    expect(await restarted.generate(view)).toEqual(generated);
    expect(await restartedStore.read(source.id)).toMatchObject({
      revision: 1,
      cutoff: generated.cutoff,
      sections: generated.sections,
    });
    expect(await restartedStore.read("00000000-0000-4000-8000-000000000099")).toBeNull();
    process.stdout.write(
      "R28_REAL_PROVIDER_PROOF " +
        JSON.stringify({
          agentId: source.id,
          provider: view.provider,
          cutoff: generated.cutoff,
          sections: generated.sections,
          revision: 1,
          reopenedStoreEqual: true,
          runningSourceRefused: true,
          otherSessionEmpty: true,
        }) +
        "\n",
    );
  } finally {
    if (agentId) await manager.closeAgent(agentId);
    rmSync(root, { recursive: true, force: true });
  }
}, 180_000);
