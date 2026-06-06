type ProblemPayload = {
  detail?: unknown;
  errors?: unknown;
};

export function getProblemMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  const problem = payload as ProblemPayload;
  const messages = collectMessages(problem.errors);
  const detail = typeof problem.detail === "string" ? problem.detail : "";

  if (messages.length > 0) {
    return detail && detail !== "Validation failed."
      ? `${detail} ${messages.join(" ")}`
      : messages.join(" ");
  }

  return detail || fallback;
}

function collectMessages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectMessages);
  if (!value || typeof value !== "object") return [];

  return Object.values(value).flatMap(collectMessages);
}
