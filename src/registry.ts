import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import type { ExperienceModule, ExperienceModuleImplementation } from "./module-api.js";
import type { ExperienceManifest } from "./types.js";

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  version: z.string().min(1),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  description: z.string().min(1).max(500),
  category: z.enum(["social", "game", "reflection"]),
  triggers: z.array(z.string().min(1).max(80)).max(20),
  capabilities: z.array(z.string().min(1).max(80)).max(20),
  riskLevel: z.enum(["low", "medium"]),
  ui: z.enum(["inline", "web", "native"]),
  memory: z.object({
    reads: z.array(z.string().min(1).max(100)).max(20),
    writes: z.array(z.string().min(1).max(100)).max(20),
  }),
  status: z.literal("ready"),
  runtime: z.literal("controlled-js"),
  publisher: z.object({ name: z.string().min(1).max(100), url: z.string().url().optional() }).optional(),
  starterPrompt: z.string().min(1).max(500),
});

export class ModuleRegistry {
  private readonly modules = new Map<string, ExperienceModule>();

  async loadFromDirectory(rootDir: string): Promise<void> {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const directory of directories) {
      await this.loadModule(resolve(rootDir, directory.name));
    }
  }

  get(id: string): ExperienceModule | undefined {
    return this.modules.get(id);
  }

  list(): ExperienceManifest[] {
    return [...this.modules.values()].map((module) => ({ ...module.manifest }));
  }

  size(): number {
    return this.modules.size;
  }

  private async loadModule(moduleDir: string): Promise<void> {
    const manifestPath = join(moduleDir, "manifest.json");
    const modulePath = await findModuleEntry(moduleDir);
    if (!modulePath) throw new Error(`Module ${moduleDir} is missing module.mjs or module.js`);
    const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8"))) as ExperienceManifest;
    if (this.modules.has(manifest.id)) throw new Error(`Duplicate experience id: ${manifest.id}`);

    const imported = await import(pathToFileURL(modulePath).href);
    const implementation = (imported.default ?? imported) as Partial<ExperienceModuleImplementation>;
    if (typeof implementation.start !== "function" || typeof implementation.handleEvent !== "function") {
      throw new Error(`Module ${manifest.id} must export start and handleEvent functions`);
    }

    this.modules.set(manifest.id, {
      manifest,
      start: implementation.start,
      handleEvent: implementation.handleEvent,
    });
  }
}

export function defaultModulesDirectory(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "experiences");
}

export async function loadDefaultModuleRegistry(): Promise<ModuleRegistry> {
  const registry = new ModuleRegistry();
  const directory = process.env.EXPERIENCE_MODULES_DIR
    ? resolve(process.env.EXPERIENCE_MODULES_DIR)
    : defaultModulesDirectory();
  await registry.loadFromDirectory(directory);
  return registry;
}

async function findModuleEntry(moduleDir: string): Promise<string | undefined> {
  for (const fileName of ["module.mjs", "module.js"]) {
    const path = join(moduleDir, fileName);
    try {
      await readFile(path, "utf8");
      return path;
    } catch {
      // Try the next supported module entry.
    }
  }
  return undefined;
}

export function validateManifest(input: unknown): ExperienceManifest {
  return manifestSchema.parse(input) as ExperienceManifest;
}

export function moduleFileExtension(path: string): string {
  return extname(path);
}
