# ADR 0330: Contract modes deny what is unsafe

- Status: Accepted
- Date: 2026-10-15
- Deciders: PI-Desktop core
- Amends: ADR 0052 §3, ADR 0053 §1, ADR 0211 §2 and §4
- Related: ADR 0064, ADR 0087, ADR 0089, `mcp-tool-approval-risk`

## Context

Plan and Goal decide which tools they allow by naming them. `plan_mode_allows`
holds a short list of read-only builtins, and every other name is denied: any
MCP tool, any plugin tool without `planSafeActions`, and any builtin added after
that list was written.

That shape has two costs.

The first is that a name is not a classification. `mcp_ctx_docs_search_docs`
says nothing about whether it mutates, and the server's own risk annotation is
not evidence — `tool_risk_with_declared` already pins `mcp_` to `Medium` for
exactly that reason. So the list cannot distinguish a read-only search from a
write, and it answers by refusing both. A user who asks Plan mode to look
something up in a configured MCP server gets nothing back, while the mode prompt
tells the model to inspect the workspace and the contract is meant to be about
mutation, not about provenance.

The second is that the list is the boundary. The mode prompt already tells the
model not to change anything in Plan or Goal, and that guidance is not a
boundary. The real gate has to be in the permission path, and a gate built out of
a name list answers the wrong question: it asks where a tool came from instead of
what the call would do.

## Decision

### 1. A contract mode denies by effect, not by name

A read-only builtin reaches the ordinary permission path. A builtin whose purpose
is to change state is denied outright. Nothing in between is admitted by default.

The read-only set is an allowlist: `Read`, `Glob`, `Grep`, `BrowserPreview`,
`asktool`, `new_context`, `ToolSearch`, plus the one submit tool that belongs to
the mode. `Write`, `Edit`, `TodoWrite`, `GenerateImages`, and the delegation
tools are outside it and stay denied in every permission mode.

It is deliberately an allowlist rather than a denylist. A builtin added later is
denied until someone decides what it does, so the mode cannot widen by omission.
`auto` and `accept-edits` cannot re-enable a denied tool, and neither can a
session grant or a scratch path.

### 2. Bash is gated, not parsed

A shell command's effect is decided by the shell that runs it. Any static reading
of the command string would be wrong, and it would be wrong in the permissive
direction — that is the failure mode worth avoiding.

So `Bash` takes a permission card in a contract mode in **every** permission
mode, including `auto`. The host does not try to decide whether a particular
command mutates. A `Bash` session grant still suppresses later prompts for the
rest of that session, which is how a user who has decided what they are doing
avoids answering the same question repeatedly.

This is a behavior change: `auto` no longer auto-allows `Bash` in Plan or Goal.
The mode selector keeps its meaning for every other tool.

### 3. An unclassifiable tool goes to a card

An MCP tool has no classification signal at all. It is routed to a permission
card rather than admitted, and the tool stays in the model's catalog so the card
is reachable. `auto` does not stand in for the decision, because "we could not
tell" is exactly the case where an automatic policy has nothing to go on.

The card is the fail-closed answer that still leaves the capability usable:
nothing runs until a human has seen the tool name.

### 4. `planSafeActions` stays the plugin escape hatch

A plugin tool does carry a classification signal, because the plugin runtime
enforces it. A non-empty `planSafeActions` list means the runtime will reject any
`action` outside the list, so the tool reaches the ordinary permission path.

A plugin tool without that list is refused, not routed to a card. The
plugin-runtime already rejects the same call with `PERMISSION_DENIED`, so an
approval the callee then ignores would not be a gate.

### 5. The runtime withholds only what the mode can never permit

`isToolAllowedInMode` keeps its allowlist shape for builtins, because a builtin
withheld here is one the model cannot discover at all. An MCP tool is not
withheld: it is declared so its card is reachable. A plugin tool without
`planSafeActions` is withheld, because the host denies it anyway.

A trusted-extension tool is withheld in a contract mode. It executes in the
sidecar process, so no `tools.execute` call reaches the host and the permission
path cannot gate it — withholding it is the only boundary that exists. This is
not a statement about the extension's trust level: an extension is user-granted
trusted code, and it keeps working in Agent mode. It is that a contract mode
must not offer a capability whose calls the host never sees.

### 6. What this does not fix

A plugin may contribute MCP tools, and that registration path carries no
`planSafeActions` declaration of its own. The host therefore decides from the
list the caller sends, which it cannot cross-check against the plugin registry.
An `agentTools` contribution is different: the plugin runtime refuses it in a
contract mode when the list is empty, so the declaration and the enforcement
agree. Closing the gap for plugin-contributed MCP tools means giving that path
the same runtime check, which is separate work and is not claimed here.

## Consequences

- Plan and Goal can use a read-only MCP tool after one approval, remembered per
  tool for the session. This is the capability the per-server `planSafeTools`
  list was reaching for, without a per-server declaration to maintain.
- `Bash` in Plan and Goal always shows a card. On a platform with no read-only
  filesystem primitive this is the honest gate, but it is friction, and the UI
  must make it visible rather than let `auto` imply otherwise.
- A mutating `Bash` command can still run once the user approves it. The gate
  bounds who decides, not what the command does; a future read-only view would
  bound the latter.
- A builtin that is not on the read-only list is denied until it is classified.
  Adding a builtin now requires a decision about Plan and Goal, which is the
  intended cost.
- `planSafeActions` is no longer how a plugin becomes visible in Plan and Goal;
  it is how a plugin tool is admitted without a card.
- A trusted-extension tool is unavailable in Plan and Goal. An extension that
  needs to contribute inspection capability has to do it through a plugin tool
  with `planSafeActions`, which the host can gate.

## Alternatives rejected

### Keep the name list and extend it per server

Rejected because it moves the maintenance burden onto the user and still cannot
classify a tool whose name carries no meaning. It also answers the wrong
question: the mode's contract is about mutation, not provenance.

### Deny by a list of known-mutating tools

Rejected because it fails open. A builtin or plugin tool added later would be
admitted in Plan and Goal by default, and `auto` would then allow it without a
card. The allowlist fails closed on the same input.

### Parse `Bash` commands to find mutations

Rejected because it cannot be made reliable. Shell syntax has too many ways to
reach the same write, and a parser that misses one produces a gate that reports
success while the mutation happens.

### Allow opaque MCP and plugin tools outright

Rejected because it would need a classification signal that does not exist.
Treating "unknown" as "safe" is the default this ADR exists to avoid.

### Route an opaque plugin tool to a card as well

Rejected because the plugin-runtime refuses the same call. A card whose approval
the callee ignores would mislead the user about what it did.

## References

- `crates/host-core/src/permissions.rs`
- `crates/host-core/src/rpc/mod.rs`
- `packages/agent-runtime/src/mode-tool-access.ts`
- `packages/agent-runtime/src/runtime.ts`
- `apps/desktop/electron/main/plugin-runtime.ts`
- `docs/spec/03-runtime/03-tools-and-permissions.md`
- `docs/spec/03-runtime/06-host-rpc-protocol.md`
