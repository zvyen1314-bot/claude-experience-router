import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(projectRoot, "scripts", "import-module.mjs");

test("import-module copies a reviewed module without executing its entrypoint", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "experience-import-"));
  const source = join(temporaryRoot, "source");
  const destinationRoot = join(temporaryRoot, "installed");
  try {
    await mkdir(source);
    await writeFile(join(source, "manifest.json"), JSON.stringify({
      id: "external-module",
      version: "0.1.0",
      name: "External Module",
      tagline: "A reviewed external module",
      description: "A module copied from another local tool.",
      category: "reflection",
      triggers: ["help me reflect"],
      capabilities: ["reflection"],
      riskLevel: "low",
      ui: "inline",
      memory: { reads: [], writes: [] },
      status: "ready",
      runtime: "controlled-js",
      publisher: { name: "external" },
      starterPrompt: "Start the reflection.",
    }, null, 2));
    await writeFile(join(source, "module.mjs"), 'throw new Error("must not execute during import");\n');
    await writeFile(join(source, "signature.json"), "{\"placeholder\":true}\n");

    const imported = await runScript(["--source", source, "--root", destinationRoot]);
    assert.equal(imported.code, 0, imported.stderr);
    assert.match(imported.stdout, /已导入模块：external-module@0\.1\.0/);
    assert.equal(await readFile(join(destinationRoot, "external-module", "module.mjs"), "utf8"), 'throw new Error("must not execute during import");\n');
    await access(join(destinationRoot, "external-module", "manifest.json"));
    assert.equal(await readFile(join(destinationRoot, "external-module", "signature.json"), "utf8"), "{\"placeholder\":true}\n");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function runScript(args) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { cwd: projectRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}

