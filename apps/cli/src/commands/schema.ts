import pc from 'picocolors';
import { getFlagsManifestJsonSchema, writeFlagsJsonSchema } from '@repo/core';

export interface SchemaCommandOptions {
  out?: string;
  print?: boolean;
}

export async function schemaCommand(options: SchemaCommandOptions = {}): Promise<void> {
  if (options.print) {
    console.log(JSON.stringify(getFlagsManifestJsonSchema(), null, 2));
    return;
  }

  const outputPath = options.out || 'flagsmith.schema.json';
  await writeFlagsJsonSchema(outputPath);

  console.log(pc.green(`✔ Generated '${outputPath}' for IDE autocompletion and hover documentation!`));
  console.log(pc.dim(`  Add '# yaml-language-server: $schema=./${outputPath}' at the top of your YAML file.`));
}
