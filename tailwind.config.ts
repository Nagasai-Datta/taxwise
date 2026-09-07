import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101B33", teal: "#0B6E6E", indigo: "#3B4E8C",
        amber: "#A85B00", moss: "#2F5D3F", panel: "#EEF2F8", rule: "#C6D0E0",
      },
    },
  },
  plugins: [],
} satisfies Config;
