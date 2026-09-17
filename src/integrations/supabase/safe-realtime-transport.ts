// Keeps the live-sync features (dashboard, recipes, projects, master list,
// pinned assets) working exactly as before, in the browser, using the real
// WebSocket untouched.
//
// The problem this fixes only happens on the SERVER, while a page is being
// rendered there before it's sent to the visitor's browser: constructing a
// Supabase client always sets up its live-sync piece too, even on pages that
// never use it, and that setup checks for a WebSocket. Some Node.js versions
// AWS Amplify can run don't have one built in — and without this fix, just
// building the page would crash immediately for that reason, even though the
// server itself never actually opens a live connection (only the browser
// does, after the page has loaded). This file gives the server a harmless
// stand-in so building the page succeeds; it is never actually connected to
// anything on the server.
class ServerSideNoopWebSocket {
  static readonly CONNECTING = 0 as const;
  static readonly OPEN = 1 as const;
  static readonly CLOSING = 2 as const;
  static readonly CLOSED = 3 as const;
  readonly CONNECTING = 0 as const;
  readonly OPEN = 1 as const;
  readonly CLOSING = 2 as const;
  readonly CLOSED = 3 as const;
  readonly readyState = 3 as const;
  readonly url = "";
  readonly protocol = "";
  readonly bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_url: string, _protocols?: string | string[]) {}
  close(): void {}
  send(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

/**
 * Pass the result of this as `realtime.transport` on every
 * `createClient(...)` call in this app.
 *
 * In the browser this returns the real, native WebSocket — nothing about
 * live-sync changes there. On the server it returns the harmless stand-in
 * above, but only if that server doesn't already have its own native
 * WebSocket (in which case that one is used, same as always).
 */
export function getSafeRealtimeTransport() {
  if (typeof WebSocket !== "undefined") {
    return WebSocket;
  }
  return ServerSideNoopWebSocket as unknown as typeof WebSocket;
}
