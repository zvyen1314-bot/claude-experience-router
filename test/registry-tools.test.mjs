import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { ModuleRegistry } from "../dist/registry.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = {
  createKey: join(projectRoot, "scripts", "create-publisher-key.mjs"),
  createModule: join(projectRoot, "scripts", "create-module.mjs"),
  signModule: join(projectRoot, "scripts", "sign-module.mjs"),
  verifyModule: join(projectRoot, "scripts", "verify-module.mjs"),
  buildRegistry: join(projectRoot, "scripts", "build-registry-index.mjs"),
};

test("signed modules produce a trusted registry entry and detect tampering", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "experience-registry-"));
  const modulesRoot = join(temporaryRoot, "modules");
  const keysRoot = join(temporaryRoot, "keys");
  const trustedKeys = join(temporaryRoot, "trusted-keys.json");
  const indexPath = join(temporaryRoot, "registry", "index.json");
  try {
    const key = await run(scripts.createKey, ["--key-id", "test-publisher", "--out-dir", keysRoot, "--trust-file", trustedKeys]);
    assert.equal(key.code, 0, key.stderr);
    const created = await run(scripts.createModule, [
      "--root", modulesRoot,
      "--id", "signed-reflection",
      "--name", "Signed Reflection",
      "--purpose", "Review a selected idea",
    ]);
    assert.equal(created.code, 0, created.stderr);
    const modulePath = join(modulesRoot, "signed-reflection");
    const signed = await run(scripts.signModule, [
      "--module", modulePath,
      "--private-key", join(keysRoot, "test-publisher.private.pem"),
      "--key-id", "test-publisher",
    ]);
    assert.equal(signed.code, 0, signed.stderr);
    await access(join(modulePath, "signature.json"));

    const verified = await run(scripts.verifyModule, ["--module", modulePath, "--trusted-keys", trustedKeys]);
    assert.equal(verified.code, 0, verified.stderr);
    assert.match(verified.stdout, /信任状态：trusted/);

    const built = await run(scripts.buildRegistry, ["--root", modulesRoot, "--output", indexPath, "--trusted-keys", trustedKeys]);
    assert.equal(built.code, 0, built.stderr);
    const index = JSON.parse(await readFile(indexPath, "utf8"));
    assert.equal(index.protocol, "experience-registry/v1");
    assert.equal(index.entries[0].signature_status, "trusted");
    assert.equal(index.entries[0].versions.length, 1);

    const registry = new ModuleRegistry({ trustedKeys: JSON.parse(await readFile(trustedKeys, "utf8")) });
    await registry.loadFromDirectory(modulesRoot);
    assert.equal(registry.getEntry("signed-reflection")?.signature_status, "trusted");

    await appendFile(join(modulePath, "module.mjs"), "\n// tampered\n", "utf8");
    const tampered = await run(scripts.verifyModule, ["--module", modulePath]);
    assert.notEqual(tampered.code, 0);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

function run(script, args) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: projectRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}
