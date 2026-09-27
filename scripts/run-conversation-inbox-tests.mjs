import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const root = process.cwd();
const temporary = await mkdtemp(path.join(root, ".tmp-inbox-tests-"));
const output = path.join(temporary, "inbox.test.cjs");

try {
  await build({
    entryPoints: [path.join(root, "tests", "conversation-inbox.test.ts")],
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
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [output], { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (status) => resolve(status ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
