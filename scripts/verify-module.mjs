#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isTrustedPublicKey, verifyModuleSignature } from "../dist/signature.js";
import { validateManifest } from "../dist/registry.js";

const HELP = `
Verify a signed local experience module without importing its implementation.

Usage:
  npm run verify-module -- --module ./experiences/my-module

Options:
  --module <path>           Module directory (required)
  --trusted-keys <path>     JSON map of key_id to public_key
  --help                    Show this message
`;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(HELP.trim());
  } else {
    await verifyModule(options);
  }
} catch (error) {
  console.error(`验证模块失败：${error instanceof Error ? error.message : String(error)}`);
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

async function verifyModule(options) {
  const moduleDir = resolve(required(options, "module"));
  const manifest = validateManifest(JSON.parse(await readFile(join(moduleDir, "manifest.json"), "utf8")));
  const entryPath = await findEntry(moduleDir);
  if (!entryPath) throw new Error("模块目录必须包含 module.mjs 或 module.js。");
  const signaturePath = join(moduleDir, "signature.json");
  const signature = JSON.parse(await readFile(signaturePath, "utf8"));
  const verified = verifyModuleSignature(manifest, await readFile(entryPath, "utf8"), signature);
  if (!verified) throw new Error("签名无效，或 manifest / module 內容已改变。");
  const trustedKeys = options.get("trusted-keys") ? JSON.parse(await readFile(resolve(options.get("trusted-keys")), "utf8")) : {};
  const status = isTrustedPublicKey(verified, trustedKeys[verified.key_id]) ? "trusted" : "signed";
  console.log(`签名有效：${manifest.id}@${manifest.version}`);
  console.log(`发布者密钥：${verified.key_id}`);
  console.log(`信任状态：${status}`);
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
