import { z } from "zod";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type {
  CompactSummaryGenerator,
  CompactSummaryAgentView,
} from "../../kontor/compact-summary-generator.js";

export interface KontorSessionOptions {
  host: { emit(msg: SessionOutboundMessage): void };
  resolveCompactSummaryAgent: (
    agentId: string,
  ) => Promise<{ ok: true; agent: CompactSummaryAgentView } | { ok: false; error: string }>;
  compactSummaryGenerator: CompactSummaryGenerator;
}

export class KontorSession {
  constructor(private readonly options: KontorSessionOptions) {}
  async handleCompactSummaryGenerateRequest(
    request: Extract<SessionInboundMessage, { type: "agent.compact_summary.generate.request" }>,
  ): Promise<void> {
    const resolved = z.string().uuid().safeParse(request.agentId).success
      ? await this.options.resolveCompactSummaryAgent(request.agentId)
      : { ok: false as const, error: "An exact session UUID is required to generate a summary." };
    if (!resolved.ok) {
      this.options.host.emit({
        type: "agent.compact_summary.generate.response",
        payload: {
          requestId: request.requestId,
          agentId: request.agentId,
          sections: null,
          cutoff: null,
          error: resolved.error,
        },
      });
      return;
    }
    try {
      if (resolved.agent.id !== request.agentId) {
        throw new Error("The resolved session does not match the requested session UUID.");
      }
      const generated = await this.options.compactSummaryGenerator.generate(resolved.agent);
      this.options.host.emit({
        type: "agent.compact_summary.generate.response",
        payload: {
          requestId: request.requestId,
          agentId: request.agentId,
          sections: generated.sections,
          cutoff: generated.cutoff,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.host.emit({
        type: "agent.compact_summary.generate.response",
        payload: {
          requestId: request.requestId,
          agentId: request.agentId,
          sections: null,
          cutoff: null,
          error: message,
        },
      });
    }
  }
}
