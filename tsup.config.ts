import { defineConfig } from "tsup";
export default defineConfig({ entry: { index: "src/index.ts", cli: "src/cli.ts", mcp: "src/mcp.ts", api: "src/api.ts" }, format: ["esm"], dts: true, clean: true, sourcemap: true });
