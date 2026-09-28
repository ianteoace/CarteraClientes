import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const expected = process.env.EMAIL_INBOX_QA_HOST;
if (!expected || new URL(process.env.DATABASE_URL ?? "").hostname !== expected ||
  new URL(process.env.DATABASE_URL_UNPOOLED ?? "").hostname !== expected) {
  throw new Error("Set EMAIL_INBOX_QA_HOST and both database URLs to an isolated, migrated QA branch.");
}
const root = process.cwd();
const temporary = await mkdtemp(path.join(root, ".tmp-email-inbox-tests-"));
try {
  const output = path.join(temporary, "email-inbox.test.cjs");
  await build({ entryPoints: [path.join(root, "tests/email-inbox.test.tsx")], outfile: output,
    bundle: true, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
    alias: { "@": path.join(root, "src"), "@/lib/workspace-context": path.join(root, "tests/workspace-context-stub.ts"),
      "@/app/bandeja/actions": path.join(root, "tests/inbox-action-stub.ts"),
      "next/navigation": path.join(root, "tests/next-navigation-stub.ts"), "server-only": path.join(root, "tests/server-only-stub.js") },
  });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [output], { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", reject); child.on("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = code;
} finally { await rm(temporary, { recursive: true, force: true }); }
