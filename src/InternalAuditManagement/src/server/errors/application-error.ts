export type ProblemStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500;

export class ApplicationError extends Error {
  constructor(
    public readonly status: ProblemStatus,
    public readonly title: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function forbidden(message = "You do not have permission to perform this action") {
  return new ApplicationError(403, "Forbidden", message);
}

export function notFound(message = "The requested resource was not found") {
  return new ApplicationError(404, "Not Found", message);
}

export function conflict(message: string, details?: Record<string, unknown>) {
  return new ApplicationError(409, "Conflict", message, details);
}
