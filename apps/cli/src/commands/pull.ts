import pc from 'picocolors';
import {
  generateManifestFromRemote,
  readFlagsManifest,
  writeFlagsManifest,
} from '@repo/core';
import { ensureProjectLinked } from '../utils/ensure-project.js';
import { getApiClient, type ClientCliOptions } from '../utils/get-client.js';

export interface PullCommandOptions extends ClientCliOptions {
  file?: string;
  projectId?: string;
}

export async function pullCommand(options: PullCommandOptions = {}): Promise<void> {
  const filePath = options.file || 'flagsmith.yaml';
  console.log(pc.bold(`\nFetching remote state from Flagsmith API...`));

  const client = getApiClient(options);
  let projectId: number | undefined = options.projectId ? parseInt(options.projectId, 10) : undefined;

  // If projectId is not specified via CLI flag, try reading from existing flagsmith.yaml
  if (!projectId) {
    const existing = await readFlagsManifest(filePath);
    if (existing.success && existing.data) {
      projectId = await ensureProjectLinked(existing.data, filePath, client);
    }
  }

  if (!projectId) {
    const projects = await client.getProjects();
    if (projects.length === 0) {
      console.error(pc.red('No projects found under this Flagsmith account.'));
      process.exit(1);
    }
    projectId = projects[0].id;
    console.log(pc.dim(`No project specified. Selected project: ${projects[0].name} (ID: ${projectId})`));
  }

  const project = await client.getProject(projectId);
  const environments = await client.getEnvironments(projectId);
  const features = await client.getFeatures(projectId);

  // Fetch feature states for all environments
  const statesByEnv = new Map<string, any[]>();
  for (const env of environments) {
    const states = await client.getFeatureStates(env.api_key);
    statesByEnv.set(env.name, states);
  }

  // 1. Generate Manifest
  const manifest = generateManifestFromRemote(
    projectId,
    project.name,
    features,
    environments,
    statesByEnv
  );

  await writeFlagsManifest(filePath, manifest);
  console.log(pc.green(`✔ Successfully pulled remote state into ${pc.bold(filePath)}`));
  console.log(pc.dim(`  Features synced:     ${features.length}`));
  console.log(pc.dim(`  Environments found:  ${environments.map((e) => e.name).join(', ')}`));
}
