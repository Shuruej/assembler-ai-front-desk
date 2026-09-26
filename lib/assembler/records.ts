import type { AgentBlueprint } from "./blueprint";

export class RecordValidationError extends Error {}

export function validateRecordPayload(blueprint: AgentBlueprint, payload: unknown, requireAll = true): Record<string, string | number | boolean | null> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new RecordValidationError("Record payload must be an object.");
  const input = payload as Record<string, unknown>;
  const fields = new Map(blueprint.dataFields.map((field) => [field.key, field]));
  if (Object.keys(input).some((key) => !fields.has(key))) throw new RecordValidationError("Record contains an unapproved field.");
  const result: Record<string, string | number | boolean | null> = {};
  for (const field of blueprint.dataFields) {
    const value = input[field.key];
    if (value == null || value === "") {
      if (requireAll && field.required) throw new RecordValidationError(`${field.label} is required.`);
      if (value === null) result[field.key] = null;
      continue;
    }
    const valid = field.type === "number" ? typeof value === "number" && Number.isFinite(value)
      : field.type === "boolean" ? typeof value === "boolean"
      : typeof value === "string" && value.length <= 2000 && (
        field.type === "enum" ? field.options.includes(value)
        : field.type === "email" ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        : field.type === "date" ? /^\d{4}-\d{2}-\d{2}$/.test(value)
        : field.type === "datetime" ? !Number.isNaN(Date.parse(value))
        : field.type === "phone" ? /^[+\d ()-]{5,30}$/.test(value)
        : true
      );
    if (!valid) throw new RecordValidationError(`${field.label} has an invalid value.`);
    result[field.key] = value as string | number | boolean;
  }
  return result;
}
