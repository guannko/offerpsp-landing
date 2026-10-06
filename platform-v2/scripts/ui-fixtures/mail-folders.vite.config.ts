import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config";
import { fileURLToPath } from "node:url";
const mock = fileURLToPath(new URL("./mail-folders-mock.ts", import.meta.url));
export default mergeConfig(base, defineConfig({ optimizeDeps: { entries: ["scripts/ui-fixtures/mail-folders-proof.html"] }, plugins: [{ name: "offline-mail-fixture", enforce: "pre",
  resolveId(id) {
    if (/\/(context\/ControlBridgeContext|lib\/supabase)$/.test(id)) return mock;
  },
}] }));
