import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { reportLovableError } from "./lib/lovable-error-reporting";

/** Central logging for every failed query/mutation; the UI shows the friendly message, the log gets the detail. */
function logFailure(scope: "query" | "mutation", error: unknown, key?: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${message}`, key ?? "");
  reportLovableError(error, { scope, key });
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => logFailure("query", error, query.queryKey),
    }),
    mutationCache: new MutationCache({
      onError: (error, _v, _c, m) => logFailure("mutation", error, m.options.mutationKey),
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        retryDelay: 800,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
