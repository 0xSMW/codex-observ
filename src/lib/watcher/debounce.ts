export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  waitMs = 100
): T {
  let timer: NodeJS.Timeout | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }) as T;

  return debounced;
}
