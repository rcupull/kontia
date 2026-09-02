type D1Metrics = {
  rows_read?: number;
  rows_written?: number;
};

type D1ResultWithMetrics = {
  meta?: D1Metrics;
};

export async function observeD1<T extends D1ResultWithMetrics>(
  operation: string,
  execute: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await execute();
    console.info("D1 operation", {
      operation,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      rowsRead: result.meta?.rows_read,
      rowsWritten: result.meta?.rows_written,
    });
    return result;
  } catch (error) {
    console.error("D1 operation failed", {
      operation,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      error: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause != null
          ? String(error.cause)
          : undefined,
    });
    throw error;
  }
}

export function logD1Batch(
  operation: string,
  startedAt: number,
  results: D1ResultWithMetrics[],
) {
  console.info("D1 operation", {
    operation,
    durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    rowsRead: results.reduce(
      (total, result) => total + Number(result.meta?.rows_read ?? 0),
      0,
    ),
    rowsWritten: results.reduce(
      (total, result) => total + Number(result.meta?.rows_written ?? 0),
      0,
    ),
    statements: results.length,
  });
}
