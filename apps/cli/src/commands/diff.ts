import pc from 'picocolors';
import {
  computePlan,
  readFlagsManifest,
} from '@repo/core';
import { formatPlan } from '../ui/diff-formatter.js';
import { ensureProjectLinked } from '../utils/ensure-project.js';
import { getApiClient, type ClientCliOptions } from '../utils/get-client.js';

export interface DiffCommandOptions extends ClientCliOptions {
  file?: string;
  prune?: boolean;
}

export async function diffCommand(options: DiffCommandOptions = {}): Promise<void> {
  const filePath = options.file || 'flagsmith.yaml';

  const manifestResult = await readFlagsManifest(filePath);
  if (!manifestResult.success || !manifestResult.data) {
    console.error(pc.red(`\n✖ Invalid manifest in '${filePath}':`));
    for (const err of manifestResult.errors || []) {
      console.error(pc.red(`  • ${err}`));
    }
    process.exit(1);
  }

  const manifest = manifestResult.data;
  const client = getApiClient(options);

  const projectId = await ensureProjectLinked(manifest, filePath, client);

  console.log(pc.dim(`Fetching remote state for project ${projectId}...`));
  const environments = await client.getEnvironments(projectId);
  const features = await client.getFeatures(projectId);

  const statesByEnv = new Map<string, any[]>();
  for (const env of environments) {
    const states = await client.getFeatureStates(env.api_key);
    statesByEnv.set(env.name, states);
  }

  // Compute & Format Plan (Compares flagsmith.yaml directly against live Flagsmith)
  const plan = computePlan(manifest, features, environments, statesByEnv, {
    prune: options.prune,
  });
  formatPlan(plan);

    if (plan.summary.totalChanges > 0) {
      process.exitCode = 2;
    }
  }
