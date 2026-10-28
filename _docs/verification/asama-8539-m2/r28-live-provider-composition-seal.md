# R28 live provider composition and persisted-summary proof (ASMA-8539)

Candidate only: no MAIN, install, merge, daemon restart or full suite. Installed UI acceptance remains with the merge/readback owner.

## Source and behavior

Started clean and detached at `c3a5e3ecdeebed98264c2d47a10b6e07176916b8`; `git merge-base --is-ancestor b3c7a037 HEAD` succeeded. The inherited live composition is preserved. This candidate adds exact UUID request binding, rejects a resolver returning another session, checks provider eligibility before cache reuse, and propagates timeline-read failures instead of silently generating from an empty excerpt.

Production composition supports Codex and OpenCode. Only Codex was exercised against a real provider here. Claude and other unsupported providers explicitly refuse; mock/test remain dev-only. A cache hit does not bypass provider refusal.

Generation calls `AgentManager.runAgent` on the source session. An idle source receives a foreground turn that changes its history and activity timestamps. A running source is refused by the manager's active-run guard. This is not a passive concurrent read. The saved cutoff describes the source before the summary turn; reopening the UI can observe a later source cutoff because generating the summary itself adds activity.

## Real proof, 2026-10-28

[Machine-readable evidence](r28-live-proof.json) records the real Codex result, exact source UUID, summary UUID/revision/cutoff and clipboard text hash. The plugin service was loaded from an immutable archive of `bd84d414` into this checkout's ignored `.dev/r28-plugin-source`; no shared plugin source was modified.

The local harness `.dev/r28-plugin-proof.mts` used the real Codex app-server client, real AgentManager, production-mode CompactSummaryProviderRunner and file-backed generator. An in-process API adapter connected the actual pinned `createSessionSummaryService` to that generator and the manager's source lookup; no daemon or successful fake provider was started.

It verified:

- Saved plugin revision `77a5d36e-98c2-477e-9c3c-7f3e0a64121f` r1 belongs to source `f3670b94-fc76-48a4-ac5c-1008e45fb9d7`.
- `readPinnedSummary` and a newly constructed service's `latest` return the identical saved object.
- macOS `pbcopy` followed by `pbpaste` returns exactly the saved text; SHA-256 `92dd29e9b4a29c772b998490ac72d82e6366096e9513fa4ea7ff0af8ce872a14`. The prior plain-text clipboard was restored.

The retained local store is `.dev/r28-live-proof/plugin-state/kontor/session-summaries-v1`, with host generation under `.dev/r28-live-proof/kontor/compact-summary-generation-v1`. These are proof stores, not installed runtime stores. Do not copy them into production as evidence of installed behavior.

## Verification

- Focused generator/provider/binding tests: 15 passed across the three changed unit suites.
- Real test in `codex-app-server-agent.real.e2e.test.ts`, selected with `-t 'R28 generates'`: real Codex generation, running-source refusal without interrupting its original turn, four nonempty sections, reopened-store equality and another-session isolation passed. The other two tests in that file were unselected.
- `npm run build:server`: passed after building workspace dependencies.
- `npm run typecheck`: passed after applying repository dependency patches following `npm ci --ignore-scripts`.
- Changed-file npm lint: passed. Repository lint reports three errors in unchanged `provider-runtime.ts`, `host-handover/bootstrap-012-compat.ts`, and `host-handover/adoption.ts`.

## Installed readback handoff

This proof does not exercise daemon RPC transport, the installed plugin, or SummarySheet's `copyText` call. After the merge owner composes the candidate with the accepted plugin and installs it, the readback owner must select an idle supported-provider session, invoke Summarize & copy, record source UUID and saved pin/cutoff, read that pin after reopening, and compare the actual clipboard text with the stored revision. Verify an unsupported provider refusal and a running-source refusal without a success banner or replacement of the saved revision. If clipboard access fails, the saved revision must remain visible with Copy again.

Provider authentication was available; no secure input is required. OpenCode remains source-composed and adapter-tested, without a real-provider success claim in this candidate.
