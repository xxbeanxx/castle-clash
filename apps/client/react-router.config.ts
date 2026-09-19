import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
  prerender: ["/", "/how-to-play", "/privacy", "/terms", "/about"],
} satisfies Config;
