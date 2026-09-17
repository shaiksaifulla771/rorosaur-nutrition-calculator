import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const REQUEST_TIMEOUT_MS = 10_000;

/** Reject if a request takes longer than `ms`, so the UI can show a retry state instead of hanging. */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms = REQUEST_TIMEOUT_MS,
  label = "Request",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out. Check your connection and retry.`)),
      ms,
    );
    Promise.resolve(promise).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
