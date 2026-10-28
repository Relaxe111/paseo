import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KontorSession } from "../session/kontor/kontor-session.js";
const DEST = "00000000-0000-4000-8000-000000000001";
const SOURCE = "00000000-0000-4000-8000-000000000002";
describe("KontorSession compact summary binding", () => {
  it.each(["current", "00000000", SOURCE])(
    "refuses a nonexact session binding: %s",
    async (requestedId) => {
      const home = await mkdtemp(join(tmpdir(), "kontor-summary-binding-"));
      const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
      let runs = 0;
      let resolutions = 0;
      try {
        const session = new KontorSession({
          host: { emit: (message) => emitted.push(message) },
          resolveCompactSummaryAgent: async () => {
            resolutions++;
            return {
              ok: true,
              agent: {
                id: DEST,
                title: "Other session",
                provider: "codex/model",
                status: "idle",
                updatedAt: "2026-10-28T10:00:00.000Z",
                lastUserMessageAt: null,
                activeTurnStartedAt: null,
              },
            };
          },
          compactSummaryGenerator: {
            generate: async () => {
              runs++;
              throw new Error("must not run");
            },
          } as never,
        });
        await session.handleCompactSummaryGenerateRequest({
          type: "agent.compact_summary.generate.request",
          requestId: "binding-proof",
          agentId: requestedId,
        });
        expect(runs).toBe(0);
        expect(resolutions).toBe(requestedId === SOURCE ? 1 : 0);
        expect(emitted).toEqual([
          {
            type: "agent.compact_summary.generate.response",
            payload: {
              requestId: "binding-proof",
              agentId: requestedId,
              sections: null,
              cutoff: null,
              error:
                requestedId === SOURCE
                  ? "The resolved session does not match the requested session UUID."
                  : "An exact session UUID is required to generate a summary.",
            },
          },
        ]);
      } finally {
        await import("node:fs/promises").then(({ rm }) =>
          rm(home, { recursive: true, force: true }),
        );
      }
    },
  );
});
