export type FollowUpPreferences = {
  confirm_appointments_by_phone: boolean;
  collect_feedback_after_confirmation: boolean;
};

export const DEFAULT_FOLLOW_UP_PREFERENCES: FollowUpPreferences = {
  confirm_appointments_by_phone: true,
  collect_feedback_after_confirmation: true,
};

export function normalizeFollowUpPreferences(value: unknown): FollowUpPreferences {
  const fields = (typeof value === "object" && value !== null ? value : {}) as
    Partial<Record<keyof FollowUpPreferences, unknown>>;
  const confirmation = typeof fields.confirm_appointments_by_phone === "boolean"
    ? fields.confirm_appointments_by_phone : true;

  return {
    confirm_appointments_by_phone: confirmation,
    collect_feedback_after_confirmation: confirmation &&
      (typeof fields.collect_feedback_after_confirmation === "boolean"
        ? fields.collect_feedback_after_confirmation : true),
  };
}
export type AgentFollowUpPreferences = {
  confirmation_call_enabled: boolean;
  feedback_enabled: boolean;
};

export const FOLLOW_UP_DISABLED_MESSAGE =
  "Follow-up confirmation calls are disabled for this agent.";

export function normalizeAgentFollowUpPreferences(value: {
  confirmation_call_enabled?: boolean | null;
  feedback_enabled?: boolean | null;
} | null | undefined): AgentFollowUpPreferences {
  const confirmation = value?.confirmation_call_enabled !== false;
  return {
    confirmation_call_enabled: confirmation,
    feedback_enabled: confirmation && value?.feedback_enabled !== false,
  };
}
