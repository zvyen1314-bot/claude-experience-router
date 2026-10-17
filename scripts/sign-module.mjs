#!/usr/bin/env node

import { access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createModuleSignature } from "../dist/signature.js";
import { validateManifest } from "../dist/registry.js";

const HELP = `
Sign a local experience module with an Ed25519 private key.

Usage:
  npm run sign-module -- --module ./experiences/my-module --private-key ./keys/example-main.private.pem --key-id example-main

Options:
  --module <path>           Module directory (required)
  --private-key <path>      PKCS8 PEM private key (required)
  --key-id <value>          Publisher key id (required)
  --output <path>           Signature path (default: <module>/signature.json)
  --help                    Show this message
`;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(HELP.trim());
  } else {
    await signModule(options);
  }
} catch (error) {
  console.error(`签名模块失败：${error instanceof Error ? error.message : String(error)}`);
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

async function signModule(options) {
  const moduleDir = resolve(required(options, "module"));
  const privateKeyPath = resolve(required(options, "private-key"));
  const keyId = required(options, "key-id");
  const manifest = validateManifest(JSON.parse(await readFile(join(moduleDir, "manifest.json"), "utf8")));
  const entryPath = await findEntry(moduleDir);
  if (!entryPath) throw new Error("模块目录必须包含 module.mjs 或 module.js。");
  const signature = createModuleSignature(
    manifest,
    await readFile(entryPath, "utf8"),
    await readFile(privateKeyPath, "utf8"),
    keyId,
  );
  const output = resolve(options.get("output") ?? join(moduleDir, "signature.json"));
  await writeFile(output, `${JSON.stringify(signature, null, 2)}\n`, "utf8");
  console.log(`已签名模块：${manifest.id}@${manifest.version}`);
  console.log(`签名文件：${output}`);
}

async function findEntry(moduleDir) {
  for (const name of ["module.mjs", "module.js"]) {
    const path = join(moduleDir, name);
    try {
      await access(path);
      return path;
    } catch {
      // Try the next supported entry file.
    }
  }
  return undefined;
}

function required(options, key) {
  const value = options.get(key);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`缺少必填参数：--${key}`);
  return value.trim();
}
