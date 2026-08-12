thread_id: 019f81e3-4938-7eb3-b162-3620de9f7612
updated_at: 2026-07-20T23:38:40+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T07-36-24-019f81e3-4938-7eb3-b162-3620de9f7612.jsonl
cwd: /Users/jay/.codex/.chatgpt-projects/g-p-69fbfea390648191b73ba48881ae9e60

# Subagent Fast mode configuration was investigated against the local Codex manual and installation

Rollout context: The user asked in Chinese how to configure Codex Fast mode for subagents. The rollout used the current local Codex manual, inspected `/Users/jay/.codex/config.toml`, and checked the installed CLI (`codex-cli 0.144.4`).

## Task 1: Configure Fast mode for subagents

Outcome: partial

Key steps:

- Fetched the current Codex manual with `node /Users/jay/.codex/skills/.system/openai-docs/scripts/fetch-codex-manual.mjs`.
- Verified the manual documents Fast mode as `service_tier = "fast"`, enabled by `[features].fast_mode = true`; it is distinct from `model_reasoning_effort` and from choosing a faster model such as `gpt-5.6-terra`.
- Verified subagent custom-agent files may override model-related settings, including `model` and `model_reasoning_effort`; the proposed configuration placed `service_tier = "fast"` in a custom agent file.
- Inspected the local configuration: `/Users/jay/.codex/config.toml` currently has `service_tier = "priority"`, `model = "gpt-5.6-sol"`, `model_reasoning_effort = "xhigh"`; `[features]` exists but did not show `fast_mode = true` in the inspected excerpt.
- Confirmed the installed CLI reports `fast_mode` as stable/true and `multi_agent` as stable/true.

Preference signals:

- The user asked specifically about configuring Fast mode “在 subagent 中”, indicating they want per-subagent control rather than changing the main agent’s defaults. Future answers should distinguish inherited parent settings from custom-agent overrides and avoid recommending a global change unless requested.

Reusable knowledge:

- CLI controls are `/fast on`, `/fast off`, and `/fast status`.
- Persistent global enablement is documented as:
  ```toml
  [features]
  fast_mode = true
  service_tier = "fast"
  ```
  (`service_tier` is top-level, not under `[agents]`; the exact placement of `[features]` and the top-level setting should be preserved.)
- `[agents]` is for orchestration controls such as `max_threads`, `max_depth`, `job_max_runtime_seconds`, and `interrupt_message`; it is not the documented location for `service_tier`.
- Custom agents live in `~/.codex/agents/` globally or `.codex/agents/` project-scoped and require `name`, `description`, and `developer_instructions`. Optional overrides include `model`, `model_reasoning_effort`, `sandbox_mode`, `mcp_servers`, and `skills.config`; omitted settings inherit from the parent session.
- Fast mode is documented as increasing supported-model speed by about 1.5x with higher ChatGPT credit consumption. The manual lists GPT-5.6, GPT-5.5, and GPT-5.4 as supported; GPT-5.6/GPT-5.5 use 2.5x Standard credits and GPT-5.4 uses 2x.
- `gpt-5.6-terra` is a separate faster/lower-cost model choice, not Fast mode. Lowering `model_reasoning_effort` also reduces reasoning effort but does not enable Fast mode.

Failures and how to do differently:

- The rollout proposed `.codex/agents/fast_worker.toml` but did not create it or verify that Codex actually accepts `service_tier` inside a custom-agent file. Future work should validate the schema with a minimal test agent or `codex --strict-config` before claiming the per-subagent configuration is operational.
- The inspected local config did not confirm that `fast_mode = true` was already enabled, so the final answer should state this as an unverified prerequisite rather than implying it was present.
- The final answer cited `learn.chatgpt.com` pages even though the source route primarily relied on the locally fetched manual; future answers should clearly separate local-manual evidence from any direct page citation.

References:

- Manual cache: `/var/folders/5_/mzwqn17d45s10ljk3vzs4xxh0000gp/T/openai-docs-cache/codex-manual.md`
- Fast mode section: manual lines 489-506; custom agents/subagent settings around lines 393-440; global `[agents]` settings around lines 414-429.
- Local config facts: `/Users/jay/.codex/config.toml:1` (`service_tier = "priority"`), `:2` (`model = "gpt-5.6-sol"`), `:4` (`model_reasoning_effort = "xhigh"`), `[features]` around `:289`.
- CLI verification: `codex-cli 0.144.4`; `codex features list` reported `fast_mode stable true` and `multi_agent stable true`.

