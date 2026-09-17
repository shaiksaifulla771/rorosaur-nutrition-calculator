import { createFileRoute, redirect } from "@tanstack/react-router";

/** Recipes live inside project folders — the standalone list redirects to Projects. */
export const Route = createFileRoute("/_authenticated/recipes/")({
  beforeLoad: () => {
    throw redirect({ to: "/projects" });
  },
  component: () => null,
});
