import { AlertTriangle, RefreshCw } from "lucide-react";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Human-readable message for any thrown value; never leaks raw stack traces to the UI. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

/** Inline error card used as the `errorComponent` on authenticated routes. */
export function RouteErrorCard({ error, reset }: { error: unknown; reset?: () => void }) {
  const router = useRouter();
  const retry = () => {
    void router.invalidate();
    reset?.();
  };
  return (
    <div
      role="alert"
      className="mx-auto mt-10 max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
    >
      <AlertTriangle className="mx-auto size-6 text-destructive" />
      <h2 className="mt-3 text-base font-semibold">Couldn't load this page</h2>
      <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button onClick={retry} variant="outline" className="mt-4">
        <RefreshCw className="size-4" /> Retry
      </Button>
    </div>
  );
}

/** Skeleton used as the `pendingComponent` on authenticated routes. */
export function RoutePending() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="space-y-2 pt-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
