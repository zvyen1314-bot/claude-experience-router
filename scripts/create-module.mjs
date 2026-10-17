#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const HELP = `
Create a local experience module.

Usage:
  npm run create-module -- --id focus-sprint --name "Focus Sprint" --purpose "Turn a vague task into one next step"

Options:
  --id <value>             Lowercase module id (required)
  --name <value>           User-facing module name (required)
  --purpose <value>        What the module helps the user do (required)
  --category <value>       social, game, or reflection (default: reflection)
  --ui <value>             inline, web, or native (default: inline)
  --risk <value>           low or medium (default: low)
  --version <value>        Module version (default: 0.1.0)
  --publisher <value>      Publisher name (default: local-developer)
  --triggers <csv>         Intent phrases used for discovery
  --capabilities <csv>     Declared capability names
  --reads <csv>            Consent read scopes
  --writes <csv>           Consent write scopes
  --root <path>            Module directory (default: ./experiences)
  --force                  Replace generated files in an existing module directory
  --help                   Show this message
`;

try {
  const options = parseOptions(process.argv.slice(2));
  if (options.has("help")) {
    console.log(HELP.trim());
  } else {
    await createModule(options);
  }
} catch (error) {
  console.error(`创建模块失败：${error instanceof Error ? error.message : String(error)}`);
  console.error(`\n${HELP.trim()}`);
  process.exitCode = 1;
}

function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`无法识别参数：${argument}`);
    const key = argument.slice(2);
    if (!key) throw new Error("参数名不能为空。");
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

async function createModule(options) {
  const id = required(options, "id");
  const name = required(options, "name");
  const purpose = required(options, "purpose");
  const category = options.get("category") ?? "reflection";
  const ui = options.get("ui") ?? "inline";
  const riskLevel = options.get("risk") ?? "low";
  const version = options.get("version") ?? "0.1.0";
  const publisher = options.get("publisher") ?? "local-developer";
  const root = resolve(options.get("root") ?? "experiences");
  const moduleDir = join(root, id);
  const triggers = csv(options.get("triggers"), [purpose.slice(0, 80)]);
  const capabilities = csv(options.get("capabilities"));
  const reads = csv(options.get("reads"));
  const writes = csv(options.get("writes"));

  assertMatch(id, /^[a-z0-9][a-z0-9-]{1,63}$/, "id 必须是 2-64 个小写字母、数字或连字符，且不能以连字符开头");
  assertLength(name, 1, 80, "name");
  assertLength(purpose, 1, 500, "purpose");
  assertOneOf(category, ["social", "game", "reflection"], "category");
  assertOneOf(ui, ["inline", "web", "native"], "ui");
  assertOneOf(riskLevel, ["low", "medium"], "risk");
  assertLength(version, 1, 40, "version");
  assertLength(publisher, 1, 100, "publisher");
  assertList(triggers, 20, 80, "triggers");
  assertList(capabilities, 20, 80, "capabilities");
  assertList(reads, 20, 100, "reads");
  assertList(writes, 20, 100, "writes");

  if (await exists(moduleDir) && !options.has("force")) {
    throw new Error(`目录已存在：${moduleDir}。如需覆盖脚手架文件，请显式使用 --force。`);
  }

  await mkdir(moduleDir, { recursive: true });
  const manifest = {
    id,
    version,
    name,
    tagline: purpose.slice(0, 160),
    description: purpose,
    category,
    triggers,
    capabilities,
    riskLevel,
    ui,
    memory: { reads, writes },
    status: "ready",
    runtime: "controlled-js",
    publisher: { name: publisher },
    starterPrompt: `Start by helping the user with: ${purpose}`.slice(0, 500),
  };

  await writeFile(join(moduleDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(moduleDir, "module.mjs"), moduleSource(), "utf8");
  await writeFile(join(moduleDir, "README.md"), readmeSource(manifest), "utf8");
  console.log(`已创建模块：${moduleDir}`);
  console.log(`下一步：npm run validate-module -- ${moduleDir}`);
}

function moduleSource() {
  return `function initialState() {
  return {
    round: 1,
    score: 0,
    hintUsed: false,
    feedback: "The module is ready for your first input.",
  };
}

export default {
  async start(_context) {
    return initialState();
  },

  async handleEvent(_context, state, event) {
    if (event.type === "restart") {
      return { state: initialState(), status: "active", message: "The module has been restarted." };
    }
    if (event.type === "finish") {
      return {
        state: { ...state, feedback: "The module has finished." },
        status: "finished",
        message: "The module has finished.",
      };
    }
    if (event.type === "hint") {
      return {
        state: { ...state, hintUsed: true, feedback: "Add a small, concrete next step." },
        status: "active",
        message: "Try making the next step smaller and more concrete.",
      };
    }
    if (event.type === "answer") {
      const answer = typeof event.payload?.answer === "string" ? event.payload.answer.trim() : "";
      if (!answer) {
        return { state: { ...state, feedback: "Please provide an answer first." }, status: "active", message: "Please provide an answer first." };
      }
      return {
        state: { ...state, round: state.round + 1, feedback: "Answer received. Add your module logic here." },
        status: "active",
        message: "Answer received.",
      };
    }
    return { state, status: "active", message: "Waiting for the next event." };
  },
};
`;
}

function readmeSource(manifest) {
  return `# ${manifest.name}

${manifest.description}

This module uses the local controlled-js runtime. Review the manifest permissions before installing it.

Validate it from the project root:

\`npm run validate-module -- ./experiences/${manifest.id}\`

The implementation lives in \`module.mjs\`. Keep user data access inside the scopes declared in \`manifest.json\` and use only the context approved by the consent policy.
`;
}

function required(options, key) {
  const value = options.get(key);
  if (typeof value !== "string" || value.trim() === "") throw new Error(`缺少必填参数：--${key}`);
  return value.trim();
}

function csv(value, fallback = []) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function assertMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function assertLength(value, minimum, maximum, label) {
  if (value.length < minimum || value.length > maximum) throw new Error(`${label} 长度必须在 ${minimum}-${maximum} 之间。`);
}

function assertOneOf(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} 必须是：${allowed.join(", ")}。`);
}

function assertList(values, maximumItems, maximumLength, label) {
  if (values.length > maximumItems) throw new Error(`${label} 最多支持 ${maximumItems} 项。`);
  for (const value of values) assertLength(value, 1, maximumLength, label);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
