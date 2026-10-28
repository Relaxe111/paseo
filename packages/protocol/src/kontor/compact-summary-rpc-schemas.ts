import { z } from "zod";

const agentIdSchema = z.string().uuid();

export const CompactSummarySectionsSchema = z
  .object({
    task: z.string(),
    decisions: z.string(),
    currentState: z.string(),
    nextStep: z.string(),
  })
  .strict();

export const AgentCompactSummaryGenerateRequestSchema = z.object({
  type: z.literal("agent.compact_summary.generate.request"),
  requestId: z.string(),
  agentId: agentIdSchema,
});

export const AgentCompactSummaryGenerateResponseSchema = z.object({
  type: z.literal("agent.compact_summary.generate.response"),
  payload: z.object({
    requestId: z.string(),
    agentId: agentIdSchema,
    sections: CompactSummarySectionsSchema.nullable(),
    cutoff: z.string().nullable(),
    error: z.string().nullable(),
  }),
});
