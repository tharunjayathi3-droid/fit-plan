export type FitPlanErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_PROFILE" | "INVALID_DIET_RESTRICTION" | "NO_SUITABLE_FOOD_ALTERNATIVE" | "NO_SUITABLE_EXERCISE_ALTERNATIVE" | "BUDGET_TOO_LOW" | "AI_SERVICE_UNAVAILABLE" | "RATE_LIMITED" | "DATABASE_ERROR" | "VALIDATION_ERROR";

export class FitPlanError extends Error {
  constructor(public readonly code: FitPlanErrorCode, message: string, public readonly status = 400) { super(message); this.name = "FitPlanError"; }
}

export function publicError(error: unknown) {
  if (error instanceof FitPlanError) return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  return { status: 500, body: { error: { code: "DATABASE_ERROR" as const, message: "Something went wrong. Please try again." } } };
}
