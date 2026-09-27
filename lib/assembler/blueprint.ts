export const FIELD_TYPES = ["string", "number", "boolean", "date", "datetime", "phone", "email", "enum"] as const;
export const TOOL_KINDS = ["internal_record", "http", "webhook", "calendar", "escalation"] as const;
export const TOOL_OPERATIONS = ["create_record", "http_request", "send_webhook", "check_availability", "create_booking", "escalate"] as const;
export const CONNECTION_KINDS = ["calendar", "http", "webhook"] as const;
export const RULE_OPERATORS = ["equals", "not_equals", "contains", "greater_than", "less_than", "exists"] as const;
export const RULE_ACTIONS = ["allow_tool", "block_tool", "require_escalation", "require_confirmation", "set_outcome"] as const;
export const WORKFLOW_TYPES = ["conversation", "collect", "tool", "decision", "outcome"] as const;

export type AgentBlueprint = {
  version: "1";
  identity: { name: string; role: string };
  objective: string;
  greeting: string;
  behavior: { instructions: string[] };
  knowledge: { requirements: string[] };
  dataFields: Array<{ key: string; label: string; type: typeof FIELD_TYPES[number]; description: string; required: boolean; options: string[] }>;
  tools: Array<{ id: string; name: string; description: string; kind: typeof TOOL_KINDS[number]; operation: typeof TOOL_OPERATIONS[number]; inputs: Array<{ key: string; type: "string" | "number" | "boolean"; description: string; required: boolean }>; expectedResult: string; connectionId: string | null; outcomeId: string | null }>;
  connections: Array<{ id: string; name: string; kind: typeof CONNECTION_KINDS[number]; reason: string; required: boolean }>;
  rules: Array<{ id: string; description: string; source: string; operator: typeof RULE_OPERATORS[number]; value: string | number | boolean | null; action: typeof RULE_ACTIONS[number]; target: string | null }>;
  outcomes: Array<{ id: string; label: string; description: string }>;
  workflow: Array<{ id: string; label: string; description: string; type: typeof WORKFLOW_TYPES[number]; references: string[] }>;
};

type Schema = Record<string, unknown>;
const string = { type: "string" };
const boolean = { type: "boolean" };
const identifier = { type: "string" };
const array = (items: Schema) => ({ type: "array", items });
const object = (properties: Record<string, Schema>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const enumeration = (values: readonly string[]) => ({ type: "string", enum: values });
const nullable = (schema: Schema) => ({ anyOf: [schema, { type: "null" }] });

// Kept beside the domain type and validator for compatibility with saved Blueprints.
export const AGENT_BLUEPRINT_SCHEMA = object({
  version: { type: "string", enum: ["1"] },
  identity: object({ name: string, role: string }),
  objective: string,
  greeting: string,
  behavior: object({ instructions: array(string) }),
  knowledge: object({ requirements: array(string) }),
  dataFields: array(object({ key: identifier, label: string, type: enumeration(FIELD_TYPES), description: string, required: boolean, options: array(string) })),
  tools: array(object({ id: identifier, name: string, description: string, kind: enumeration(TOOL_KINDS), operation: enumeration(TOOL_OPERATIONS), inputs: array(object({ key: identifier, type: enumeration(["string", "number", "boolean"]), description: string, required: boolean })), expectedResult: string, connectionId: nullable(identifier), outcomeId: nullable(identifier) })),
  connections: array(object({ id: identifier, name: string, kind: enumeration(CONNECTION_KINDS), reason: string, required: boolean })),
  rules: array(object({ id: identifier, description: string, source: string, operator: enumeration(RULE_OPERATORS), value: { anyOf: [string, { type: "number" }, boolean, { type: "null" }] }, action: enumeration(RULE_ACTIONS), target: nullable(identifier) })),
  outcomes: array(object({ id: identifier, label: string, description: string })),
  workflow: array(object({ id: identifier, label: string, description: string, type: enumeration(WORKFLOW_TYPES), references: array(identifier) })),
});

export class BlueprintValidationError extends Error {}

function fail(path: string, message: string): never { throw new BlueprintValidationError(`${path}: ${message}`); }
function record(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key)) || keys.some((key) => !(key in result))) fail(path, "has missing or unsupported properties");
  return result;
}
function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) fail(path, "must be nonempty text of at most 2000 characters");
  return value;
}
function id(value: unknown, path: string): string {
  const result = text(value, path);
  if (!/^[a-z][a-z0-9_]*$/.test(result) || result.length > 64) fail(path, "must be a machine-safe identifier");
  return result;
}
function bool(value: unknown, path: string): void { if (typeof value !== "boolean") fail(path, "must be boolean"); }
function choice(value: unknown, values: readonly string[], path: string): void { if (typeof value !== "string" || !values.includes(value)) fail(path, "has an unsupported value"); }
function list(value: unknown, path: string, max = 30): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `must be an array of at most ${max} items`);
  return value;
}
function unique(values: string[], path: string): void { if (new Set(values).size !== values.length) fail(path, "contains duplicates"); }

export function validateAgentBlueprint(value: unknown): AgentBlueprint {
  const b = record(value, "blueprint", ["version", "identity", "objective", "greeting", "behavior", "knowledge", "dataFields", "tools", "connections", "rules", "outcomes", "workflow"]);
  if (b.version !== "1") fail("version", "must be 1");
  const identity = record(b.identity, "identity", ["name", "role"]);
  text(identity.name, "identity.name"); text(identity.role, "identity.role");
  text(b.objective, "objective"); text(b.greeting, "greeting");
  for (const section of ["behavior", "knowledge"] as const) {
    const key = section === "behavior" ? "instructions" : "requirements";
    const item = record(b[section], section, [key]);
    list(item[key], `${section}.${key}`).forEach((entry, index) => text(entry, `${section}.${key}[${index}]`));
  }
  const fields = list(b.dataFields, "dataFields");
  const fieldIds = fields.map((entry, i) => {
    const p = `dataFields[${i}]`; const f = record(entry, p, ["key", "label", "type", "description", "required", "options"]);
    id(f.key, `${p}.key`); text(f.label, `${p}.label`); choice(f.type, FIELD_TYPES, `${p}.type`); text(f.description, `${p}.description`); bool(f.required, `${p}.required`);
    const options = list(f.options, `${p}.options`, 30); options.forEach((option, j) => text(option, `${p}.options[${j}]`));
    unique(options as string[], `${p}.options`);
    if (f.type === "enum" ? options.length < 2 : options.length !== 0) fail(`${p}.options`, "must contain at least two enum choices and be empty otherwise");
    return f.key as string;
  }); unique(fieldIds, "dataFields.keys");
  const connections = list(b.connections, "connections");
  const connectionIds = connections.map((entry, i) => { const p = `connections[${i}]`; const c = record(entry, p, ["id", "name", "kind", "reason", "required"]); id(c.id, `${p}.id`); text(c.name, `${p}.name`); choice(c.kind, CONNECTION_KINDS, `${p}.kind`); text(c.reason, `${p}.reason`); bool(c.required, `${p}.required`); return c.id as string; }); unique(connectionIds, "connections.ids");
  const tools = list(b.tools, "tools", 10);
  const toolIds = tools.map((entry, i) => {
    const p = `tools[${i}]`; const t = record(entry, p, ["id", "name", "description", "kind", "operation", "inputs", "expectedResult", "connectionId", "outcomeId"]);
    id(t.id, `${p}.id`); text(t.name, `${p}.name`); text(t.description, `${p}.description`); choice(t.kind, TOOL_KINDS, `${p}.kind`); choice(t.operation, TOOL_OPERATIONS, `${p}.operation`); text(t.expectedResult, `${p}.expectedResult`);
    const expectedOperations: Record<string, string[]> = { internal_record: ["create_record"], http: ["http_request"], webhook: ["send_webhook"], calendar: ["check_availability", "create_booking"], escalation: ["escalate"] };
    if (!expectedOperations[t.kind as string].includes(t.operation as string)) fail(`${p}.operation`, "does not match tool kind");
    const inputIds = list(t.inputs, `${p}.inputs`, 20).map((entry, j) => { const q = `${p}.inputs[${j}]`; const input = record(entry, q, ["key", "type", "description", "required"]); id(input.key, `${q}.key`); choice(input.type, ["string", "number", "boolean"], `${q}.type`); text(input.description, `${q}.description`); bool(input.required, `${q}.required`); return input.key as string; }); unique(inputIds, `${p}.inputs.keys`);
    const requiredByOperation: Record<string, string[]> = { check_availability: ["requested_date"], create_booking: ["slot_date", "slot_time", "customer_name", "phone_number"], escalate: ["reason"] };
    for (const key of requiredByOperation[t.operation as string] ?? []) {
      if (!(t.inputs as Array<Record<string, unknown>>).some((input) => input.key === key && input.type === "string" && input.required === true)) fail(`${p}.inputs`, `requires a string ${key} input`);
    }
    if (t.connectionId !== null && (!connectionIds.includes(id(t.connectionId, `${p}.connectionId`)))) fail(`${p}.connectionId`, "must reference a connection");
    if (["calendar", "http", "webhook"].includes(t.kind as string) && t.connectionId === null) fail(`${p}.connectionId`, "is required for an external tool");
    if (t.connectionId !== null && ["calendar", "http", "webhook"].includes(t.kind as string)) {
      const connection = connections.find((item) => (item as Record<string, unknown>).id === t.connectionId) as Record<string, unknown>;
      if (connection.kind !== t.kind) fail(`${p}.connectionId`, "must reference a connection of the matching kind");
    }
    if (t.outcomeId !== null) id(t.outcomeId, `${p}.outcomeId`);
    return t.id as string;
  }); unique(toolIds, "tools.ids");
  const outcomes = list(b.outcomes, "outcomes");
  const outcomeIds = outcomes.map((entry, i) => { const p = `outcomes[${i}]`; const o = record(entry, p, ["id", "label", "description"]); id(o.id, `${p}.id`); text(o.label, `${p}.label`); text(o.description, `${p}.description`); return o.id as string; }); unique(outcomeIds, "outcomes.ids");
  tools.forEach((entry, i) => { const outcomeId = (entry as Record<string, unknown>).outcomeId; if (outcomeId !== null && !outcomeIds.includes(outcomeId as string)) fail(`tools[${i}].outcomeId`, "must reference an outcome"); });
  const rules = list(b.rules, "rules");
  const ruleSources = new Set([...fieldIds, ...tools.flatMap((entry) => (entry as AgentBlueprint["tools"][number]).inputs.map((input) => input.key))]);
  const ruleIds = rules.map((entry, i) => {
    const p = `rules[${i}]`; const r = record(entry, p, ["id", "description", "source", "operator", "value", "action", "target"]);
    id(r.id, `${p}.id`); text(r.description, `${p}.description`); text(r.source, `${p}.source`); choice(r.operator, RULE_OPERATORS, `${p}.operator`); choice(r.action, RULE_ACTIONS, `${p}.action`);
    if (!ruleSources.has(r.source as string)) fail(`${p}.source`, "must reference a collected field or tool input");
    if (r.value !== null && !["string", "number", "boolean"].includes(typeof r.value)) fail(`${p}.value`, "has an unsupported type");
    if (r.operator === "exists" ? r.value !== null : r.value === null) fail(`${p}.value`, "does not match operator");
    if (r.target !== null) id(r.target, `${p}.target`);
    if (["allow_tool", "block_tool"].includes(r.action as string) && !toolIds.includes(r.target as string)) fail(`${p}.target`, "must reference a tool");
    if (["require_escalation", "require_confirmation"].includes(r.action as string) && r.target !== null && !toolIds.includes(r.target as string)) fail(`${p}.target`, "must reference a tool or be null");
    if (r.action === "set_outcome" && !outcomeIds.includes(r.target as string)) fail(`${p}.target`, "must reference an outcome");
    return r.id as string;
  }); unique(ruleIds, "rules.ids");
  unique([...fieldIds, ...toolIds, ...connectionIds, ...ruleIds, ...outcomeIds], "blueprint.referenceIds");
  const workflow = list(b.workflow, "workflow", 40);
  const referenceIds = new Set([...fieldIds, ...toolIds, ...connectionIds, ...ruleIds, ...outcomeIds]);
  const workflowIds = workflow.map((entry, i) => { const p = `workflow[${i}]`; const w = record(entry, p, ["id", "label", "description", "type", "references"]); id(w.id, `${p}.id`); text(w.label, `${p}.label`); text(w.description, `${p}.description`); choice(w.type, WORKFLOW_TYPES, `${p}.type`); const refs = list(w.references, `${p}.references`, 20).map((ref, j) => id(ref, `${p}.references[${j}]`)); unique(refs, `${p}.references`); if (refs.some((ref) => !referenceIds.has(ref))) fail(`${p}.references`, "contains an unknown reference"); return w.id as string; }); unique(workflowIds, "workflow.ids");
  return value as AgentBlueprint;
}
