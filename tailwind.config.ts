import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#eef2f7",
        cloud: "#f8fafc",
        accent: "#2dd4bf",
        berry: "#c026d3"
      },
      boxShadow: {
        soft: "0 18px 70px rgba(15, 23, 42, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
