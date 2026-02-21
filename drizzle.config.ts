import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/core/data/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./agentcoder.db",
  },
});
