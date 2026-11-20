import * as fs from 'node:fs/promises';
import YAML from 'yaml';
import { FlagsManifestSchema, FLAGSMITH_SCHEMA_URL, type FlagsManifest } from './schema.js';

export interface ParseResult {
  success: boolean;
  data?: FlagsManifest;
  errors?: string[];
}

export function parseYamlContent(content: string): ParseResult {
  let parsedRaw: unknown;
  try {
    parsedRaw = YAML.parse(content);
  } catch (err: any) {
    return {
      success: false,
      errors: [`YAML Syntax Error: ${err.message}`],
    };
  }

  const validation = FlagsManifestSchema.safeParse(parsedRaw);
  if (!validation.success) {
    const errorMessages = validation.error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`
    );
    return {
      success: false,
      errors: errorMessages,
    };
  }

  // Semantic checks
  const manifest = validation.data;
  const semanticErrors: string[] = [];
  const keysSeen = new Set<string>();

  for (const flag of manifest.flags) {
    if (keysSeen.has(flag.key)) {
      semanticErrors.push(`Duplicate flag key found: '${flag.key}'`);
    }
    keysSeen.add(flag.key);

    if (flag.type === 'MULTIVARIATE' && flag.variants && flag.variants.length > 0) {
      const totalPct = flag.variants.reduce((sum, v) => sum + v.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        semanticErrors.push(
          `Flag '${flag.key}' variants allocation total must equal 100%, got ${totalPct}%`
        );
      }
    }

    const envNamesSeen = new Set<string>();
    for (const envOverride of flag.environments) {
      if (envNamesSeen.has(envOverride.name)) {
        semanticErrors.push(
          `Flag '${flag.key}' has duplicate environment override for '${envOverride.name}'`
        );
      }
      envNamesSeen.add(envOverride.name);
    }
  }

  if (semanticErrors.length > 0) {
    return {
      success: false,
      errors: semanticErrors,
    };
  }

  return {
    success: true,
    data: manifest,
  };
}

export async function readFlagsManifest(filePath: string): Promise<ParseResult> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return parseYamlContent(fileContent);
  } catch (err: any) {
    return {
      success: false,
      errors: [`Failed to read file '${filePath}': ${err.message}`],
    };
  }
}

export function serializeFlagsManifest(manifest: FlagsManifest): string {
  const doc = new YAML.Document(manifest);
  doc.commentBefore =
    ` yaml-language-server: $schema=${FLAGSMITH_SCHEMA_URL}\n` +
    ' Run "fm diff" to preview or "fm apply" to push changes';
  return doc.toString({ indent: 2 });
}

export async function writeFlagsManifest(filePath: string, manifest: FlagsManifest): Promise<void> {
  const content = serializeFlagsManifest(manifest);
  await fs.writeFile(filePath, content, 'utf-8');
}

