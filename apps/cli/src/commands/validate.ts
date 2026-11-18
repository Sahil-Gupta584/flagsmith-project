import pc from 'picocolors';
import { readFlagsManifest } from '@repo/core';

export async function validateCommand(filePath = 'flagsmith.yaml'): Promise<void> {
  console.log(pc.bold(`\nValidating '${filePath}'...`));

  const result = await readFlagsManifest(filePath);
  if (!result.success || !result.data) {
    console.error(pc.red('\n✖ Validation failed with errors:'));
    for (const err of result.errors || []) {
      console.error(pc.red(`  • ${err}`));
    }
    process.exit(1);
  }

  const { project, flags } = result.data;
  console.log(pc.green(`\n✔ '${filePath}' is valid!`));
  console.log(pc.dim(`  Project ID:   ${project.id}${project.name ? ` (${project.name})` : ''}`));
  console.log(pc.dim(`  Total Flags:  ${flags.length}`));
}

