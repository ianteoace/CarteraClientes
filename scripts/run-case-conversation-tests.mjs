import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const root = process.cwd();
const temporary = await mkdtemp(path.join(root, ".tmp-case-conversation-tests-"));
try {
  const output = path.join(temporary, "case-conversation.test.cjs");
  await build({
    entryPoints: [path.join(root, "tests", "case-conversation.test.ts")],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: {
      "@": path.join(root, "src"),
      "@/lib/workspace-context": path.join(root, "tests", "workspace-context-stub.ts"),
      "server-only": path.join(root, "tests", "server-only-stub.js"),
    },
  });
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [output], { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (status !== 0) process.exitCode = status;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
