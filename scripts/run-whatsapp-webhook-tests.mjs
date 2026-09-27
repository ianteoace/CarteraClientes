import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const projectRoot = process.cwd();
const temporaryDirectory = await mkdtemp(path.join(projectRoot, ".tmp-whatsapp-tests-"));
const outputFile = path.join(temporaryDirectory, "whatsapp-webhooks.test.cjs");

try {
  await build({
    entryPoints: [path.join(projectRoot, "tests", "whatsapp-webhooks.test.ts")],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "tests", "server-only-stub.js"),
    },
  });

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [outputFile], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
