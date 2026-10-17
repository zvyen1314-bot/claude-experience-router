#!/usr/bin/env node

import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isTrustedPublicKey, moduleDigests, verifyModuleSignature } from "../dist/signature.js";
import { validateManifest } from "../dist/registry.js";

const HELP = `
Build a shareable public registry index from local experience modules.

Usage:
  npm run build-registry-index -- --root ./experiences --output ./registry/index.json

Options:
  --root <path>            Module directory (default: ./experiences)
  --output <path>          Registry index path (default: ./registry/index.json)
  --trusted-keys <path>    JSON map of key_id to public_key
  --help                   Show this message
`;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(HELP.trim());
  } else {
    await buildRegistry(options);
  }
} catch (error) {
  console.error(`生成注册表失败：${error instanceof Error ? error.message : String(error)}`);
  console.error(`\n${HELP.trim()}`);
  process.exitCode = 1;
}

function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`无法识别参数：${argument}`);
    const key = argument.slice(2);
    if (key === "help") {
      options.set(key, true);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`参数 --${key} 需要一个值。`);
    options.set(key, value);
    index += 1;
  }
  return options;
}

async function buildRegistry(options) {
  const root = resolve(options.get("root") ?? "experiences");
  const output = resolve(options.get("output") ?? "registry/index.json");
  const trustedKeys = options.get("trusted-keys")
    ? JSON.parse(await readFile(resolve(options.get("trusted-keys")), "utf8"))
    : {};
  const previous = await readExistingIndex(output);
  const entries = [];
  const directories = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const directory of directories) {
    const moduleDir = join(root, directory.name);
    const manifest = validateManifest(JSON.parse(await readFile(join(moduleDir, "manifest.json"), "utf8")));
    const entryPath = await findEntry(moduleDir);
    if (!entryPath) throw new Error(`Module ${manifest.id} is missing module.mjs or module.js`);
    const entrySource = await readFile(entryPath, "utf8");
    const digests = moduleDigests(manifest, entrySource);
    const signatureInput = await readSignature(moduleDir);
    const signature = signatureInput ? verifyModuleSignature(manifest, entrySource, signatureInput) : undefined;
    const signatureStatus = signature
      ? isTrustedPublicKey(signature, trustedKeys[signature.key_id]) ? "trusted" : "signed"
      : signatureInput ? "invalid" : "unsigned";
    const previousEntry = previous.entries.find((entry) => entry.id === manifest.id);
    const version = {
      version: manifest.version,
      published_at: signature?.signed_at ?? new Date().toISOString(),
      signature_status: signatureStatus,
      manifest_sha256: digests.manifestSha256,
      entry_sha256: digests.entrySha256,
    };
    const versions = [
      ...(previousEntry?.versions ?? []).filter((item) => item.version !== manifest.version),
      version,
    ];
    entries.push({
      id: manifest.id,
      version: manifest.version,
      name: manifest.name,
      tagline: manifest.tagline,
      description: manifest.description,
      category: manifest.category,
      capabilities: manifest.capabilities,
      risk_level: manifest.riskLevel,
      ui: manifest.ui,
      memory: manifest.memory,
      publisher: manifest.publisher,
      signature_status: signatureStatus,
      signature: signature ?? undefined,
      versions,
    });
  }

  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, `${JSON.stringify({
    protocol: "experience-registry/v1",
    generated_at: new Date().toISOString(),
    entries,
  }, null, 2)}\n`, "utf8");
  console.log(`已生成注册表：${output}`);
  console.log(`模块数量：${entries.length}`);
}

async function readExistingIndex(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch (error) {
    if (error?.code === "ENOENT") return { entries: [] };
    throw error;
  }
}

async function readSignature(moduleDir) {
  try {
    return JSON.parse(await readFile(join(moduleDir, "signature.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    return { invalid: true };
  }
}

async function findEntry(moduleDir) {
  for (const name of ["module.mjs", "module.js"]) {
    if (await exists(join(moduleDir, name))) return join(moduleDir, name);
  }
  return undefined;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
