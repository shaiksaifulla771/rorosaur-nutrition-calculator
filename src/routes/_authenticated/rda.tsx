import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorCard, RoutePending } from "@/components/RouteStates";

import { PageHeader } from "@/components/RowActionsMenu";
import { RdaTable } from "@/components/nutrition/RdaTable";

export const Route = createFileRoute("/_authenticated/rda")({
  head: () => ({
    meta: [
      { title: "RDA Settings — Rorosaur" },
      {
        name: "description",
        content:
          "Edit your ICMR-NIN 2020 reference intakes per age band. Values drive %RDA across the calculator, recipes and PDFs.",
      },
      { property: "og:title", content: "RDA Settings — Rorosaur" },
      {
        property: "og:description",
        content: "Customize reference nutritional values for recipe trials.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div>
      <PageHeader
        title="RDA Settings"
        subtitle="Reference daily intakes (ICMR-NIN 2020) used to compute %RDA. Shared by everyone using this workspace."
      />
      <RdaTable />
    </div>
  ),
});
