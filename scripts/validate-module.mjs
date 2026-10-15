import { access, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateManifest } from "../dist/registry.js";

const moduleDir = process.argv[2];
if (!moduleDir) {
  console.error("用法：npm run validate-module -- ./experiences/your-module");
  process.exit(1);
}

const root = resolve(moduleDir);
try {
  const manifest = validateManifest(JSON.parse(await readFile(join(root, "manifest.json"), "utf8")));
  const entry = join(root, "module.mjs");
  await access(entry);
  const imported = await import(pathToFileURL(entry).href);
  const implementation = imported.default ?? imported;
  if (typeof implementation.start !== "function" || typeof implementation.handleEvent !== "function") {
    throw new Error("module.mjs 必须导出 start 和 handleEvent 函数");
  }
  console.log(`有效模块：${manifest.id}@${manifest.version}`);
  console.log(`能力：${manifest.capabilities.join(", ") || "无"}`);
  console.log(`运行时：${manifest.runtime}`);
} catch (error) {
  console.error(`模块校验失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
