import pc from 'picocolors';
import type { ReconciliationPlan } from '@repo/core';

export function formatPlan(plan: ReconciliationPlan): void {
    if (plan.summary.totalChanges === 0 && plan.summary.untrackedCount === 0) {
      console.log(pc.green('\n✔ Live Flagsmith state matches desired flagsmith.yaml. No changes needed.'));
      return;
    }

    console.log(pc.bold('\nExecution Plan:'));
    console.log(pc.dim('The following actions will be performed to reconcile desired state:\n'));

    // 1. Creates
    for (const create of plan.creates) {
      console.log(pc.green(`  + [CREATE] Flag: ${pc.bold(create.key)}`));
      console.log(pc.dim(`    Description:    ${create.payload.description || '(none)'}`));
      console.log(pc.dim(`    Type:           ${create.payload.type}`));
      console.log(pc.dim(`    Default State:  ${create.payload.default_enabled ? 'enabled' : 'disabled'}`));
      if (create.payload.initial_value !== null && create.payload.initial_value !== undefined) {
        console.log(pc.dim(`    Default Value:  ${JSON.stringify(create.payload.initial_value)}`));
      }
      console.log();
    }

    // 2. Feature Updates
    for (const update of plan.updates) {
      console.log(pc.yellow(`  ~ [UPDATE] Flag: ${pc.bold(update.key)}`));
      for (const change of update.changes) {
        console.log(
          `    ${change.property}: ${pc.red(JSON.stringify(change.from))} ${pc.dim('->')} ${pc.green(
            JSON.stringify(change.to)
          )}`
        );
      }
      console.log();
    }

    // 3. Environment State Updates
    for (const envUpdate of plan.envStateUpdates) {
      console.log(
        pc.yellow(
          `  ~ [UPDATE] Environment Override: ${pc.cyan(`[${envUpdate.environmentName}]`)} on ${pc.bold(
            envUpdate.flagKey
          )}`
        )
      );
      for (const change of envUpdate.changes) {
        console.log(
          `    ${change.property}: ${pc.red(JSON.stringify(change.from))} ${pc.dim('->')} ${pc.green(
            JSON.stringify(change.to)
          )}`
        );
      }
      console.log();
    }

    // 4. Untracked Remote Features (in dashboard, not in YAML)
    if (plan.untracked.length > 0) {
      for (const u of plan.untracked) {
        console.log(
          pc.cyan(
            `  ? [UNTRACKED] Flag: ${pc.bold(u.key)} ${pc.dim(
              '(Exists in Flagsmith dashboard, missing in YAML. Run "fm pull" to sync)'
            )}`
          )
        );
      }
      console.log();
    }

    // 5. Deletions (if --prune)
    for (const del of plan.deletions) {
      console.log(pc.red(`  - [DELETE] Flag: ${pc.bold(del.key)} (Feature ID: ${del.featureId})`));
      console.log();
    }

    // Summary footer
    console.log(pc.dim('--------------------------------------------------'));
    const parts = [
      pc.green(`${plan.summary.createCount} to create`),
      pc.yellow(`${plan.summary.updateCount + plan.summary.envUpdateCount} to update`),
      pc.red(`${plan.summary.deleteCount} to delete`),
    ];
    if (plan.summary.untrackedCount > 0) {
      parts.push(pc.cyan(`${plan.summary.untrackedCount} untracked in dashboard`));
    }
    console.log(pc.bold(`Plan: ${parts.join(', ')}.`));
    console.log(pc.dim('--------------------------------------------------\n'));
  }
