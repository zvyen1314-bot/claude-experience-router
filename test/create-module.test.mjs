import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = join(projectRoot, "scripts", "create-module.mjs");

test("create-module scaffolds and protects a local module", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "experience-module-"));
  const modulePath = join(temporaryRoot, "focus-sprint");
  try {
    const created = await runCreateModule([
      "--root", temporaryRoot,
      "--id", "focus-sprint",
      "--name", "Focus Sprint",
      "--purpose", "Turn a vague task into one next step",
      "--category", "reflection",
      "--capabilities", "reflection,next_step_generation",
      "--reads", "selected_excerpts",
    ]);
    assert.equal(created.code, 0, created.stderr);

    const manifest = JSON.parse(await readFile(join(modulePath, "manifest.json"), "utf8"));
    assert.equal(manifest.id, "focus-sprint");
    assert.deepEqual(manifest.memory.reads, ["selected_excerpts"]);
    await access(join(modulePath, "module.mjs"));
    await access(join(modulePath, "README.md"));

    const validated = await runNodeScript(join(projectRoot, "scripts", "validate-module.mjs"), [modulePath]);
    assert.equal(validated.code, 0, validated.stderr);
    assert.match(validated.stdout, /有效模块：focus-sprint@0\.1\.0/);

    const duplicate = await runCreateModule([
      "--root", temporaryRoot,
      "--id", "focus-sprint",
      "--name", "Focus Sprint",
      "--purpose", "Turn a vague task into one next step",
    ]);
    assert.notEqual(duplicate.code, 0);
    assert.match(duplicate.stderr, /目录已存在/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function runCreateModule(args) {
  return runNodeScript(scriptPath, args);
}

function runNodeScript(script, args) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: projectRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}
