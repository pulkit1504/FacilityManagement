type PerformanceMetadata = Record<string, string | number | boolean | null | undefined>;

const defaultSlowOperationThresholdMs = 250;

export async function timeAsync<T>(
  operation: string,
  action: () => Promise<T>,
  metadata: PerformanceMetadata = {}
): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await action();
    logPerformance(operation, performance.now() - startedAt, "success", metadata);
    return result;
  } catch (error) {
    logPerformance(operation, performance.now() - startedAt, "error", metadata);
    throw error;
  }
}

export function instrumentAsyncMethods<T extends object>(target: T, component: string): T {
  return new Proxy(target, {
    get(currentTarget, property, receiver) {
      const value = Reflect.get(currentTarget, property, receiver);
      if (typeof value !== "function" || typeof property !== "string") {
        return value;
      }

      return (...args: unknown[]) =>
        timeAsync(`${component}.${property}`, () => Promise.resolve(value.apply(currentTarget, args)), {
          component,
          method: property
        });
    }
  });
}

function logPerformance(
  operation: string,
  durationMs: number,
  status: "success" | "error",
  metadata: PerformanceMetadata
) {
  const configuredThresholdMs = Number(process.env.PERFORMANCE_LOG_THRESHOLD_MS ?? defaultSlowOperationThresholdMs);
  const thresholdMs = Number.isFinite(configuredThresholdMs) ? configuredThresholdMs : defaultSlowOperationThresholdMs;
  const verbose = process.env.PERFORMANCE_LOG_VERBOSE === "true";
  const roundedDurationMs = Math.round(durationMs);

  if (!verbose && status === "success" && roundedDurationMs < thresholdMs) {
    return;
  }

  console.info({
    event: "backend.performance",
    operation,
    status,
    durationMs: roundedDurationMs,
    thresholdMs,
    ...metadata
  });
}
