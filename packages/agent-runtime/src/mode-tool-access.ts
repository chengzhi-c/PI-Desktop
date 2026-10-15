import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Mode } from "@pi-desktop/shared";

/** Known editing/delegation names stay declared across contract-mode changes. */
const RETAINED_MODE_TOOLS = new Set(["Write", "Edit", "Task", "TaskWait", "TaskList", "TaskStop"]);

/**
 * A contract mode withholds tools whose only purpose is to change state. They
 * stay declared so a strict gateway never sees an undeclared call, and the
 * execution guard below refuses them, but the model is never offered them as a
 * real option.
 *
 * Every other tool is declared, including one this module cannot classify: an
 * MCP or plugin tool reaches the model and the host permission path decides
 * whether the call runs. Withholding is reserved for a name the mode can never
 * permit, because a withheld tool is one the model cannot discover at all.
 *
 * The host enforces the same posture from the other side in
 * `PermissionManager::contract_admission`. A name denied here must also be
 * denied there, or the model gets a tool it can never use.
 */
const CONTRACT_MODE_WITHHELD = new Set([
  "Write",
  "Edit",
  "TodoWrite",
  "Task",
  "TaskWait",
  "TaskList",
  "TaskStop",
  // Agent-only or state-changing local tools. They are already absent from a
  // contract mode's builtin list, so listing them changes no observable
  // behavior today; it keeps this set the single answer to "what does a
  // contract mode refuse" instead of leaving the agreement to coincidence.
  "GenerateImages",
  "PluginCheck",
  "PluginScaffold",
  "PluginPack",
  "Skill",
  "ScheduledTaskCreate",
  "ScheduledTaskUpdate",
  "ScheduledTaskDelete",
]);

export function retainModeToolDeclaration(name: string): boolean {
  return RETAINED_MODE_TOOLS.has(name);
}

export function contractModeWithholdsTool(name: string): boolean {
  return CONTRACT_MODE_WITHHELD.has(name);
}

export function modeToolDenial(name: string, mode: Mode): string {
  return `${name} is not allowed in ${mode} mode. No action was performed. Continue read-only inspection and planning with the permitted tools; implementation requires Agent mode or approval of the submitted plan or goal.`;
}

/**
 * Declarations are not grants. Recheck immediately before execution, including
 * references retained from an earlier mode. Throwing here uses pi's existing
 * tool-error channel and the real call id, without inventing transcript items.
 */
export function withModeExecutionGuard(tool: AgentTool, denial: () => string | undefined): AgentTool {
  const currentDenial = denial();
  return {
    ...tool,
    description: currentDenial ? `${tool.description}\n\n${currentDenial}` : tool.description,
    execute: async (...args) => {
      const reason = denial();
      if (reason) throw new Error(reason);
      return tool.execute(...args);
    },
  };
}
