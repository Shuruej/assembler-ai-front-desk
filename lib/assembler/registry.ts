import type { AgentBlueprint } from "./blueprint";
import { evaluateToolRules } from "./rules";

type Tool = AgentBlueprint["tools"][number];
export type ToolResult = { success: boolean; data?: unknown; error?: string; code?: string; outcome?: string };
export type ToolExecutor = (tool: Tool, args: Record<string, unknown>) => Promise<ToolResult>;
export type ToolExecutors = Record<Tool["kind"], ToolExecutor>;

function validateArguments(tool: Tool, value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Tool arguments must be an object.";
  const args = value as Record<string, unknown>;
  const inputs = new Map(tool.inputs.map((input) => [input.key, input]));
  if (Object.keys(args).some((key) => !inputs.has(key))) return "Tool arguments contain an unsupported field.";
  for (const input of tool.inputs) {
    const item = args[input.key];
    if (item === undefined || item === null || item === "") {
      if (input.required) return `${input.key} is required.`;
      continue;
    }
    if (typeof item !== input.type || (input.type === "string" && (item as string).length > 2000) || (input.type === "number" && !Number.isFinite(item))) return `${input.key} has an invalid value.`;
  }
  return null;
}

export async function dispatchBlueprintTool(input: {
  blueprint: AgentBlueprint;
  toolId: string;
  arguments: unknown;
  executors: ToolExecutors;
  setOutcome?: (outcomeId: string) => Promise<void>;
}): Promise<ToolResult> {
  const tool = input.blueprint.tools.find((item) => item.id === input.toolId);
  if (!tool) return { success: false, code: "unknown_tool", error: "This tool is not part of the agent blueprint." };
  const invalid = validateArguments(tool, input.arguments);
  if (invalid) return { success: false, code: "invalid_arguments", error: invalid };
  const args = input.arguments as Record<string, unknown>;
  const rules = evaluateToolRules(input.blueprint.rules, tool.id, args);
  if (rules.blocked) return { success: false, code: "blocked_by_rule", error: rules.blocked.description };
  if (rules.requiresAllow && !rules.allowed) return { success: false, code: "not_allowed_by_rule", error: "The conditions for this action have not been met." };
  if (rules.confirmation && args.confirmed !== true) return { success: false, code: "confirmation_required", error: rules.confirmation.description };
  try {
    if (rules.escalation && tool.kind !== "escalation") {
      const escalation = input.blueprint.tools.find((item) => item.kind === "escalation");
      if (!escalation) return { success: false, code: "escalation_unavailable", error: "This issue needs human review." };
      const result = await input.executors.escalation(escalation, { ...args, reason: rules.escalation.description });
      if (result.success && escalation.outcomeId && input.setOutcome) {
        await input.setOutcome(escalation.outcomeId);
        return { ...result, outcome: escalation.outcomeId };
      }
      return result;
    }
    const executor = input.executors[tool.kind];
    if (!executor) return { success: false, code: "unsupported_tool", error: "No executor is available for this tool." };
    const result = await executor(tool, args);
    const outcomeId = rules.outcome?.target ?? tool.outcomeId;
    if (result.success && outcomeId && input.setOutcome) {
      await input.setOutcome(outcomeId);
      return { ...result, outcome: outcomeId };
    }
    return result;
  } catch {
    return { success: false, code: "executor_failure", error: "The action could not be completed. Please try again or request human help." };
  }
}
