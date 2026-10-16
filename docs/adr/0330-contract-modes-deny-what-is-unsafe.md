# ADR 0330: Contract modes deny what is unsafe

- Status: Accepted
- Date: 2026-10-15
- Deciders: PI-Desktop core
- Amends: ADR 0052 §3, ADR 0053 §1, ADR 0211 §4
- Related: ADR 0087, ADR 0089, `mcp-tool-approval-risk`

## Context

Plan and Goal must keep direct mutation tools unavailable without making
read-only MCP capabilities inaccessible. Shell commands and opaque MCP tools
cannot be classified reliably by their names or self-reported risk. Mode prompts
provide guidance; permission checks decide whether a call may execute.

## Decision

- Read-only builtins use the ordinary permission path: `Read`, `Glob`, `Grep`,
  `BrowserPreview`, `asktool`, `new_context`, and `ToolSearch`. The runtime also
  permits the submit tool belonging to the current mode.
- Other builtins are denied before risk, permission mode, session grants, or
  scratch-path exceptions. New builtins remain denied until classified.
- `Bash` and user MCP tools require explicit approval in every permission mode,
  including `auto`. An exact-tool `allow-session` grant suppresses subsequent
  prompts only in that session.
- Plugin tools require a non-empty `planSafeActions` list. Admission does not
  grant permission: ordinary risk, external-path, and session-grant rules still
  apply. The plugin runtime rejects unlisted actions before dispatch.
- Plugin-contributed MCP tools have no supported `planSafeActions` declaration.
  Their execution callback rejects Plan and Goal independently of caller-supplied
  admission metadata.
- Trusted-extension tools and Agent-only local tools remain unavailable in
  contract modes, including through references retained before a mode change.
  These tools can execute outside the host permission path.
- MCP tools remain discoverable through existing ToolSearch and explicit
  selections. Admission does not make every MCP schema a core declaration.
- Refusing an approval card returns `TOOL_DENIED`; a contract-mode hard denial
  retains its existing `_IN_PLAN` error code in both Plan and Goal.

## Consequences

Plan and Goal can use MCP capabilities after user approval without a separate
server allowlist. `auto` no longer automatically permits their Bash or MCP calls.
Agent-mode permission behavior is unchanged.

Approval is not filesystem isolation: an approved shell command or opaque MCP
call may mutate state. This policy controls authorization, not the effects of
arbitrary code. Plugin authors remain responsible for the semantics of actions
they declare plan-safe.

## Alternatives

- Parsing shell commands cannot reliably establish whether they mutate files.
- Trusting MCP risk annotations lets remote code classify its own access.
- A builtin denylist admits newly added tools by omission; explicit classification
  keeps unknown local execution paths closed.

## References

- `crates/host-core/src/permissions.rs`
- `packages/agent-runtime/src/mode-tool-access.ts`
- `apps/desktop/electron/main/plugin-runtime.ts`
- `docs/spec/03-runtime/03-tools-and-permissions.md`
