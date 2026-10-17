#!/usr/bin/env node

import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateManifest } from "../dist/registry.js";

const HELP = `
Import a local experience module without executing its code.

Usage:
  npm run import-module -- --source ./path/to/module

Options:
  --source <path>          Source module directory (required)
  --root <path>            Destination module directory (default: ./experiences)
  --force                  Replace an existing module with the same id
  --help                   Show this message
`;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(HELP.trim());
  } else {
    await importModule(options);
  }
} catch (error) {
  console.error(`导入模块失败：${error instanceof Error ? error.message : String(error)}`);
  console.error(`\n${HELP.trim()}`);
  process.exitCode = 1;
}

function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`无法识别参数：${argument}`);
    const key = argument.slice(2);
    if (key === "force" || key === "help") {
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

async function importModule(options) {
  const source = resolve(required(options, "source"));
  const root = resolve(options.get("root") ?? "experiences");
  const manifestPath = join(source, "manifest.json");
  const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const entryName = await findEntry(source);
  if (!entryName) throw new Error("模块目录必须包含 module.mjs 或 module.js。");

  const destination = join(root, manifest.id);
  if (source === destination) throw new Error("源目录和目标目录不能相同。");
  if (await exists(destination) && !options.has("force")) {
    throw new Error(`目标目录已存在：${destination}。如需覆盖，请显式使用 --force。`);
  }

  await mkdir(destination, { recursive: true });
  await copyFile(manifestPath, join(destination, "manifest.json"));
  await copyFile(join(source, entryName), join(destination, entryName));
  const signaturePath = join(source, "signature.json");
  if (await exists(signaturePath)) await copyFile(signaturePath, join(destination, "signature.json"));
  const readmePath = join(source, "README.md");
  if (await exists(readmePath)) await copyFile(readmePath, join(destination, "README.md"));

  console.log(`已导入模块：${manifest.id}@${manifest.version}`);
  console.log(`目标目录：${destination}`);
  console.log("下一步：先审阅 module.mjs，再运行 validate-module。");
}

async function findEntry(source) {
  for (const name of ["module.mjs", "module.js"]) {
    if (await exists(join(source, name))) return name;
  }
  return undefined;
}

function required(options, key) {
  const value = options.get(key);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`缺少必填参数：--${key}`);
  return value.trim();
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
