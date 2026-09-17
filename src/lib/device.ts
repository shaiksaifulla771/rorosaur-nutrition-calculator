const KEY = "rorosaur.device-id";

/**
 * Stable per-browser identifier used to decide whether a login needs a
 * one-time code. It carries no personal data and is hashed with the account id
 * before it is ever stored server-side.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(KEY);
  if (existing && /^[A-Za-z0-9_-]{16,128}$/.test(existing)) return existing;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  window.localStorage.setItem(KEY, id);
  return id;
}
