#!/usr/bin/env node

import { generateKeyPairSync } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const HELP = `
Create an Ed25519 publisher key pair.

Usage:
  npm run create-publisher-key -- --key-id example-main --out-dir ./keys

Options:
  --key-id <value>          Stable publisher key id (required)
  --out-dir <path>          Output directory (default: ./keys)
  --trust-file <path>       Also update a trusted-keys JSON map
  --force                   Replace existing key files
  --help                    Show this message
`;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(HELP.trim());
  } else {
    await createKeyPair(options);
  }
} catch (error) {
  console.error(`创建发布者密钥失败：${error instanceof Error ? error.message : String(error)}`);
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

async function createKeyPair(options) {
  const keyId = required(options, "key-id");
  const outputDir = resolve(options.get("out-dir") ?? "keys");
  const privatePath = join(outputDir, `${keyId}.private.pem`);
  const publicPath = join(outputDir, `${keyId}.public.json`);
  if (!options.has("force") && (await exists(privatePath) || await exists(publicPath))) {
    throw new Error(`密钥文件已存在：${outputDir}。如需覆盖，请显式使用 --force。`);
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyValue = publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  await mkdir(outputDir, { recursive: true });
  await writeFile(privatePath, privateKey.export({ type: "pkcs8", format: "pem" }), { encoding: "utf8", mode: 0o600 });
  await writeFile(publicPath, `${JSON.stringify({ key_id: keyId, algorithm: "ed25519", public_key: publicKeyValue }, null, 2)}\n`, "utf8");

  const trustFile = options.get("trust-file");
  if (trustFile) {
    const trustPath = resolve(trustFile);
    const trustedKeys = await readJsonMap(trustPath);
    trustedKeys[keyId] = publicKeyValue;
    await mkdir(resolve(trustPath, ".."), { recursive: true });
    await writeFile(trustPath, `${JSON.stringify(trustedKeys, null, 2)}\n`, "utf8");
  }

  console.log(`已创建发布者密钥：${keyId}`);
  console.log(`私钥：${privatePath}`);
  console.log(`公钥记录：${publicPath}`);
}

async function readJsonMap(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("信任文件必须是 key_id 到 public_key 的 JSON 对象。");
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
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
