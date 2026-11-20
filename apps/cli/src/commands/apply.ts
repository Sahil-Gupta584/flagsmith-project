import pc from 'picocolors';
import {
  computePlan,
  readFlagsManifest,
} from '@repo/core';
import { formatPlan } from '../ui/diff-formatter.js';
import { promptApplyConfirmation } from '../ui/prompts.js';
import { ensureProjectLinked } from '../utils/ensure-project.js';
import { getApiClient, type ClientCliOptions } from '../utils/get-client.js';

export interface ApplyCommandOptions extends ClientCliOptions {
  file?: string;
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  prune?: boolean;
}

export async function applyCommand(options: ApplyCommandOptions = {}): Promise<void> {
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

  // 1. Compute Plan (Directly compares flagsmith.yaml vs live Flagsmith state)
  const plan = computePlan(manifest, features, environments, statesByEnv, {
    prune: options.prune,
  });

  formatPlan(plan);

  if (plan.summary.totalChanges === 0) {
    return;
  }

  if (options.dryRun) {
    console.log(pc.cyan('Dry-run complete. No changes were applied.'));
    return;
  }

  // 2. Confirmation prompt (skipped if --force or --yes)
  const skipPrompt = options.force || options.yes;
  if (!skipPrompt) {
    const confirmed = await promptApplyConfirmation();
    if (!confirmed) {
      console.log(pc.dim('\nApply aborted. No changes were made.'));
      return;
    }
  }

  // 3. Execute Mutations
  console.log(pc.bold('Applying changes to Flagsmith...'));

  // (a) Create new features
  for (const createAction of plan.creates) {
    console.log(pc.dim(`  Creating feature '${createAction.key}'...`));
    const createdFeature = await client.createFeature(plan.projectId, createAction.payload);

    // If the YAML also defines environment overrides for this new feature, apply them now
    for (const env of environments) {
      const override = createAction.flagDef.environments.find((item) => item.name === env.name);
      if (override) {
        await client.updateEnvironmentFeature(env.api_key, createdFeature.id, {
          enabled: override.enabled,
          value: override.value !== undefined ? override.value : (createAction.flagDef.value ?? null),
        });
      }
    }
  }

  // (b) Update existing feature metadata
  for (const updateAction of plan.updates) {
    console.log(pc.dim(`  Updating feature '${updateAction.key}'...`));
    await client.updateFeature(plan.projectId, updateAction.featureId, updateAction.payload);
  }

  // (c) Update environment state overrides
  for (const envAction of plan.envStateUpdates) {
    console.log(
      pc.dim(`  Updating state for '${envAction.flagKey}' in [${envAction.environmentName}]...`)
    );
    await client.updateEnvironmentFeature(
      envAction.environmentApiKey,
      envAction.featureId,
      {
        enabled: envAction.payload.enabled,
        value: envAction.payload.feature_state_value,
      }
    );
  }

  // (d) Deletions (if prune mode)
  for (const delAction of plan.deletions) {
    console.log(pc.dim(`  Deleting feature '${delAction.key}'...`));
    await client.deleteFeature(plan.projectId, delAction.featureId);
  }

  console.log(pc.green('\n✔ Reconciled successfully! Remote Flagsmith is now in sync with flagsmith.yaml'));
}
