import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "FitPlan — Your fitness plan, built around you",
    short_name: "FitPlan",
    description: "Your personal home for training, nutrition, and progress.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f7f8f5",
    theme_color: "#70865b",
    icons: [
      { src: "/fitplan-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/fitplan-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
