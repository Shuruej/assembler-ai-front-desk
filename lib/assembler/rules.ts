import type { AgentBlueprint } from "./blueprint";

export type BlueprintRule = AgentBlueprint["rules"][number];

export function matchesRule(rule: BlueprintRule, values: Record<string, unknown>): boolean {
  const actual = values[rule.source];
  const expected = rule.value;
  switch (rule.operator) {
    case "exists": return actual !== undefined && actual !== null && actual !== "";
    case "equals": return actual === expected;
    case "not_equals": return actual !== undefined && actual !== null && actual !== expected;
    case "contains": return typeof actual === "string" && typeof expected === "string" && actual.toLowerCase().includes(expected.toLowerCase());
    case "greater_than": return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "less_than": return typeof actual === "number" && typeof expected === "number" && actual < expected;
  }
}

export function evaluateToolRules(rules: AgentBlueprint["rules"], toolId: string, values: Record<string, unknown>) {
  const matched = rules.filter((rule) => matchesRule(rule, values));
  const requiresAllow = rules.some((rule) => rule.action === "allow_tool" && rule.target === toolId);
  const blocked = matched.find((rule) => rule.action === "block_tool" && rule.target === toolId);
  const allowed = matched.find((rule) => rule.action === "allow_tool" && rule.target === toolId);
  const confirmation = matched.find((rule) => rule.action === "require_confirmation" && (rule.target === null || rule.target === toolId));
  const escalation = matched.find((rule) => rule.action === "require_escalation" && (rule.target === null || rule.target === toolId));
  const outcome = matched.find((rule) => rule.action === "set_outcome");
  return { blocked, allowed, requiresAllow, confirmation, escalation, outcome };
}
