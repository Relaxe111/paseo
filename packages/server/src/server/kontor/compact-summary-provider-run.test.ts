import pino from "pino";
import { describe, expect, test } from "vitest";
import {
  COMPACT_SUMMARY_LIVE_PROVIDER_GAP,
  CompactSummaryProviderRunner,
} from "./compact-summary-provider-run.js";

const agent = {
  id: "00000000-0000-4000-8000-000000000010",
  title: "Authorized disposable session",
  status: "idle",
  provider: "mock/five-minute-stream",
  updatedAt: "2026-10-25T09:00:00.000Z",
  lastUserMessageAt: "2026-10-25T10:00:00.000Z",
  activeTurnStartedAt: null,
};

function agentManagerWithLoadedSession(runAgent: (...args: never[]) => Promise<unknown>) {
  return {
    getAgent: () => ({ id: agent.id, provider: agent.provider }) as never,
    runAgent,
    getTimeline: () => [],
  };
}

describe("compact summary provider runner", () => {
  test("refuses unsupported providers with owner-bearing gap text", async () => {
    const runner = new CompactSummaryProviderRunner({
      isDevBuild: false,
      agentManager: {
        runAgent: async () => ({ finalText: "{}", canceled: false, sessionId: "s", timeline: [] }),
        getTimeline: () => [],
      },
      agentStorage: { get: async () => null } as never,
      logger: pino({ level: "silent" }),
    });
    await expect(
      runner.generateSections({ ...agent, provider: "claude/claude-3" }),
    ).rejects.toThrow(COMPACT_SUMMARY_LIVE_PROVIDER_GAP);
  });

  test("passes outputSchema for composed live providers on production builds", async () => {
    let capturedOptions: unknown;
    const runner = new CompactSummaryProviderRunner({
      isDevBuild: false,
      agentManager: agentManagerWithLoadedSession(async (_id, _prompt, options) => {
        capturedOptions = options;
        return {
          finalText: JSON.stringify({
            task: "Live task",
            decisions: "Live decisions",
            currentState: "Live state",
            nextStep: "Live next",
          }),
          canceled: false,
          sessionId: "session-live",
          timeline: [],
        };
      }),
      agentStorage: { get: async () => null } as never,
      logger: pino({ level: "silent" }),
    });
    await expect(
      runner.generateSections({ ...agent, provider: "opencode/claude-sonnet" }),
    ).resolves.toMatchObject({ task: "Live task" });
    expect(capturedOptions).toMatchObject({
      outputSchema: expect.objectContaining({
        required: ["task", "decisions", "currentState", "nextStep"],
      }),
    });
  });

  test("parses provider-run JSON on authorized mock sessions", async () => {
    const runner = new CompactSummaryProviderRunner({
      isDevBuild: true,
      agentManager: agentManagerWithLoadedSession(async () => ({
        finalText: JSON.stringify({
          task: "Task",
          decisions: "Decisions",
          currentState: "State",
          nextStep: "Next",
        }),
        canceled: false,
        sessionId: "session-1",
        timeline: [],
      })),
      agentStorage: { get: async () => null } as never,
      logger: pino({ level: "silent" }),
    });
    await expect(runner.generateSections(agent)).resolves.toMatchObject({
      task: "Task",
      nextStep: "Next",
    });
  });
  test("refuses unreadable history before invoking a provider", async () => {
    let runs = 0;
    const runner = new CompactSummaryProviderRunner({
      isDevBuild: false,
      agentManager: {
        ...agentManagerWithLoadedSession(async () => {
          runs++;
          throw new Error("must not run");
        }),
        getTimeline: () => {
          throw new Error("History unavailable");
        },
      },
      agentStorage: {} as never,
      logger: pino({ level: "silent" }),
    });
    await expect(runner.generateSections({ ...agent, provider: "codex/model" })).rejects.toThrow(
      "History unavailable",
    );
    expect(runs).toBe(0);
  });
});
