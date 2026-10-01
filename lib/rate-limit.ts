import { FitPlanError } from "@/lib/errors";

const buckets = new Map<string, { count: number; resets: number }>();
/** Process-local guardrail. For multi-instance deployments, replace with a shared store. */
export function rateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resets <= now) { bucket = { count: 0, resets: now + windowMs }; buckets.set(key, bucket); }
  bucket.count += 1;
  if (bucket.count > limit) throw new FitPlanError("RATE_LIMITED", "Too many attempts. Please try again shortly.", 429);
}
