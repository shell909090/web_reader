/** Run fn over items with at most `limit` concurrent executions (semaphore pattern). */
export async function pConcurrent<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let running = 0;
  const pending: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (running < limit) {
      running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => pending.push(resolve));
  };

  const release = (): void => {
    const next = pending.shift();
    if (next) {
      next();
    } else {
      running--;
    }
  };

  await Promise.all(
    items.map((item) =>
      acquire().then(async () => {
        try {
          await fn(item);
        } finally {
          release();
        }
      }),
    ),
  );
}
