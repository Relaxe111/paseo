import type {
  CompactSummaryAgentView,
  CompactSummarySections,
} from "./compact-summary-generator.js";

/** Prompt marker mock/test providers recognize for Kontor compact summaries. */
export const KONTOR_COMPACT_SUMMARY_PROMPT_MARKER = "KONTOR_COMPACT_SUMMARY_V1";

/** Tail activity items included in the provider prompt (not a transcript-wide render scan). */
export const COMPACT_SUMMARY_ACTIVITY_TAIL_LIMIT = 48;

export const COMPACT_SUMMARY_SECTIONS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["task", "decisions", "currentState", "nextStep"],
  properties: {
    task: { type: "string" },
    decisions: { type: "string" },
    currentState: { type: "string" },
    nextStep: { type: "string" },
  },
} as const;

export function buildCompactSummaryProviderPrompt(input: {
  agent: CompactSummaryAgentView;
  cutoff: string;
  activityExcerpt: string;
}): string {
  const { agent, cutoff, activityExcerpt } = input;
  return [
    KONTOR_COMPACT_SUMMARY_PROMPT_MARKER,
    "You are generating a compact session summary for Kontor.",
    "Return JSON only that matches this JSON Schema:",
    JSON.stringify(COMPACT_SUMMARY_SECTIONS_JSON_SCHEMA),
    "",
    "Session metadata (authoritative cutoff):",
    JSON.stringify({
      agentId: agent.id,
      title: agent.title,
      status: agent.status,
      provider: agent.provider,
      cutoff,
    }),
    "",
    "Recent session activity (bounded tail excerpt; do not assume missing history):",
    activityExcerpt.trim() || "No recent activity excerpt was available.",
  ].join("\n");
}

export function parseCompactSummarySectionsJson(text: string): CompactSummarySections {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The provider did not return JSON compact summary sections.");
  }
  const parsed = JSON.parse(trimmed.slice(start, end + 1)) as Partial<CompactSummarySections>;
  for (const key of ["task", "decisions", "currentState", "nextStep"] as const) {
    if (typeof parsed[key] !== "string" || !parsed[key]!.trim()) {
      throw new Error(`The provider JSON compact summary is missing "${key}".`);
    }
  }
  return {
    task: parsed.task!.trim(),
    decisions: parsed.decisions!.trim(),
    currentState: parsed.currentState!.trim(),
    nextStep: parsed.nextStep!.trim(),
  };
}
