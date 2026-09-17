import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { recipesQuery } from "@/lib/recipes";
import { masterItemsQuery, setMasterPinned } from "@/lib/master";

/** Pinned recipes derived from the shared recipes query (no extra fetch). */
export function usePinnedRecipes() {
  const recipes = useQuery(recipesQuery());
  const pinned = useMemo(() => (recipes.data ?? []).filter((r) => r.is_pinned), [recipes.data]);
  return { pinned, isLoading: recipes.isLoading, error: recipes.error };
}

/** Pinned, active master ingredients plus an unpin helper. */
export function usePinnedIngredients() {
  const queryClient = useQueryClient();
  const master = useQuery(masterItemsQuery());
  const pinned = useMemo(
    () => (master.data ?? []).filter((m) => m.is_pinned && m.is_active),
    [master.data],
  );
  const unpin = async (id: string) => {
    await setMasterPinned(id, false);
    await queryClient.invalidateQueries({ queryKey: ["master-items"] });
  };
  return { pinned, unpin, isLoading: master.isLoading, error: master.error };
}
