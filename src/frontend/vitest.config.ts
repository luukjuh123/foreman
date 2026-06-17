import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test-setup.ts"],
    include: ["./__tests__/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // next/font/google is not available in jsdom; return a stub that
      // satisfies the `Inter({ ... }) → { variable, className }` call shape.
      "next/font/google": path.resolve(__dirname, "./__mocks__/next-font-google.ts"),
    },
  },
});
