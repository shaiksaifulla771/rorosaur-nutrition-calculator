import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rorosaur — Nutrition Platform" },
      {
        name: "description",
        content:
          "Formulate infant & toddler recipes, score protein quality with WHO/FAO amino-acid patterns, and track %RDA against ICMR-NIN references.",
      },
      { property: "og:title", content: "Rorosaur — Nutrition Platform" },
      {
        property: "og:description",
        content: "Amino-acid scoring, %RDA per age band, versioned recipes and spec-sheet PDFs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
