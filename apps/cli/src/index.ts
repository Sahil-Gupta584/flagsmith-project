#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { applyCommand } from './commands/apply.js';
import { diffCommand } from './commands/diff.js';
import { initCommand } from './commands/init.js';
import { pullCommand } from './commands/pull.js';
import { schemaCommand } from './commands/schema.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('fm')
  .description('Declarative GitOps and bi-directional synchronization CLI for Flagsmith')
  .version('0.1.0');

// Global Options
program
  .option('--api-key <key>', 'Flagsmith Master/Admin API Key')
  .option('--api-url <url>', 'Flagsmith API base URL (defaults to https://api.flagsmith.com/api/v1)');

// Command: init
program
  .command('init')
  .description('Interactive setup wizard to initialize Flagsmith project and flagsmith.yaml')
  .action(async () => {
    try {
      await initCommand();
    } catch (err: any) {
      console.error(pc.red(`\n✖ Init error: ${err.message}`));
      process.exit(1);
    }
  });

// Command: pull
program
  .command('pull')
  .description('Reverse-sync current live state from Flagsmith API into flagsmith.yaml (Prisma db pull model)')
  .option('-f, --file <path>', 'Path to flags manifest', 'flagsmith.yaml')
  .option('-p, --project-id <id>', 'Flagsmith project ID')
  .action(async (cmdOptions) => {
    try {
      const globalOpts = program.opts();
      await pullCommand({ ...globalOpts, ...cmdOptions });
    } catch (err: any) {
      console.error(pc.red(`\n✖ Pull failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: diff / status
program
  .command('diff')
  .alias('status')
  .description('Preview differences between flagsmith.yaml and live Flagsmith (1-to-1 mirror)')
  .option('-f, --file <path>', 'Path to flags manifest', 'flagsmith.yaml')
  .option('--no-prune', 'Do not flag missing remote flags for deletion')
  .action(async (cmdOptions) => {
    try {
      const globalOpts = program.opts();
      await diffCommand({ ...globalOpts, ...cmdOptions });
    } catch (err: any) {
      console.error(pc.red(`\n✖ Diff failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: apply / push
program
  .command('apply')
  .alias('push')
  .description('Reconcile desired state in flagsmith.yaml to Flagsmith with interactive preview')
  .option('-f, --file <path>', 'Path to flags manifest', 'flagsmith.yaml')
  .option('--dry-run', 'Simulate changes without executing mutations')
  .option('-y, --yes', 'Automatically approve and apply changes without prompting')
  .option('--force', 'Force overwrite and bypass confirmation prompt')
  .option('--no-prune', 'Do not delete remote flags that are absent from YAML')
  .action(async (cmdOptions) => {
    try {
      const globalOpts = program.opts();
      await applyCommand({ ...globalOpts, ...cmdOptions });
    } catch (err: any) {
      console.error(pc.red(`\n✖ Apply failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: validate
program
  .command('validate [file]')
  .description('Validate YAML syntax and semantic rules of the manifest')
  .action(async (file) => {
    try {
      await validateCommand(file || 'flagsmith.yaml');
    } catch (err: any) {
      console.error(pc.red(`\n✖ Validation failed: ${err.message}`));
      process.exit(1);
    }
  });

// Command: schema
program
  .command('schema')
  .description('Generate a JSON Schema for flagsmith.yaml IDE autocompletion and validation')
  .option('-o, --out <path>', 'Output path for the JSON schema', 'flagsmith.schema.json')
  .option('--print', 'Print the JSON schema to stdout instead of writing a file')
  .action(async (cmdOptions) => {
    try {
      await schemaCommand(cmdOptions);
    } catch (err: any) {
      console.error(pc.red(`\n✖ Schema generation failed: ${err.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);

