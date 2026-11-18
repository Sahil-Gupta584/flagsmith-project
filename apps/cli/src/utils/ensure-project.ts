import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { FlagsmithApiClient } from '@repo/api-client';
import { writeFlagsManifest, type FlagsManifest } from '@repo/core';

/**
 * Ensures that the given manifest has a valid positive project.id linked to Flagsmith.
 * If project.id is 0 or unlinked, it queries the live Flagsmith account, finds or prompts
 * for the project to bind, updates flagsmith.yaml, and returns the resolved project ID.
 */
export async function ensureProjectLinked(
  manifest: FlagsManifest,
  filePath: string,
  client: FlagsmithApiClient
): Promise<number> {
  if (manifest.project.id && manifest.project.id > 0) {
    return manifest.project.id;
  }

  const projName = manifest.project.name || 'unnamed';
  console.log(
    pc.yellow(
      `\n⚠ Project '${projName}' in '${filePath}' is not linked to a live Flagsmith project yet (ID: ${manifest.project.id || 0}).`
    )
  );

  const s = p.spinner();
  s.start('Connecting to Flagsmith to find available projects...');
  const projects = await client.getProjects();
  s.stop(`Found ${projects.length} project(s) in your Flagsmith account.`);

  if (projects.length === 0) {
    console.error(
      pc.red('✖ No projects found in your Flagsmith account. Please create a project in the Flagsmith dashboard first.')
    );
    process.exit(1);
  }

  // Check if an exact name match exists
  const exactMatch = projects.find(
    (proj) => proj.name.toLowerCase() === projName.toLowerCase()
  );

  let selectedId: number;

  if (exactMatch) {
    const confirmLink = await p.confirm({
      message: `Found matching Flagsmith project '${exactMatch.name}' (ID: ${exactMatch.id}). Link this repository to it?`,
      initialValue: true,
    });
    if (p.isCancel(confirmLink)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    if (confirmLink) {
      selectedId = exactMatch.id;
    } else {
      const choice = await p.select({
        message: 'Select the Flagsmith project to link to:',
        options: projects.map((proj) => ({
          value: proj.id,
          label: proj.name,
          hint: `ID: ${proj.id}`,
        })),
      });
      if (p.isCancel(choice)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }
      selectedId = choice as number;
    }
  } else {
    const choice = await p.select({
      message: `Select the Flagsmith project to link to '${projName}':`,
      options: projects.map((proj) => ({
        value: proj.id,
        label: proj.name,
        hint: `ID: ${proj.id}`,
      })),
    });
    if (p.isCancel(choice)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    selectedId = choice as number;
  }

  // Update manifest and write back to YAML
  manifest.project.id = selectedId;
  const boundProject = projects.find((proj) => proj.id === selectedId);
  if (boundProject) {
    manifest.project.name = boundProject.name;
  }

  await writeFlagsManifest(filePath, manifest);
  console.log(
    pc.green(
      `✔ Linked '${filePath}' to Flagsmith project '${manifest.project.name}' (ID: ${manifest.project.id})\n`
    )
  );

  return selectedId;
}

