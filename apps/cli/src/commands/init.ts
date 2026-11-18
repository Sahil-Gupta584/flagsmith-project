import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { FlagsmithApiClient, type Environment } from '@repo/api-client';
import {
  getTemplateFlags,
  writeFlagsManifest,
  type FlagsManifest,
  type TemplateType,
} from '@repo/core';
import { pullCommand } from './pull.js';

export async function initCommand(): Promise<void> {
  p.intro(pc.bold(pc.cyan('Flagsmith YAML: Declarative GitOps Setup Wizard')));

  // Step 1: Choose initialization mode (Offline Template vs Live Account)
  const initMode = await p.select({
    message: 'How would you like to initialize flagsmith.yaml?',
    options: [
      {
        value: 'template',
        label: '🚀 Start from a Starter Template (Offline / No API key needed)',
        hint: 'Scaffold production-grade SaaS, AI, or E-Commerce flags in your repo',
      },
      {
        value: 'connect',
        label: '🔗 Connect to a live Flagsmith project',
        hint: 'Authenticate with API key to introspect or sync with remote account',
      },
    ],
  });

  if (p.isCancel(initMode)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // PATH A: Offline Template Scaffold (Zero API Key Required)
  // --------------------------------------------------------------------------
  if (initMode === 'template') {
    const templateChoice = await p.select({
      message: 'Choose a starter template to scaffold:',
      options: [
        {
          value: 'saas',
          label: '💼 Universal B2B / SaaS Product (Recommended)',
          hint: 'Maintenance kill-switch, billing, rate limits, team invites & navigation A/B test',
        },
        {
          value: 'ai',
          label: '🤖 AI / LLM Application',
          hint: 'Model routing (Gemini/GPT), streaming, token limits & web tools',
        },
        {
          value: 'ecommerce',
          label: '🛒 E-Commerce / Consumer App',
          hint: '1-click checkout, promo banner, cart discount & recommendation A/B test',
        },
        {
          value: 'blank',
          label: '📄 Blank / Minimal',
          hint: 'Clean boilerplate with empty flags list',
        },
      ],
    });

    if (p.isCancel(templateChoice)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const projectNameInput = await p.text({
      message: 'Project name:',
      placeholder: 'e.g. Screenly, Acme App',
      validate: (v) => (!v || !v.trim() ? 'Project name is required' : undefined),
    });

    if (p.isCancel(projectNameInput)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const standardEnvironments: Environment[] = [
      { id: 1, name: 'Production', api_key: 'env_prod_placeholder', project: 0 },
      { id: 2, name: 'Development', api_key: 'env_dev_placeholder', project: 0 },
    ];

    const initialFlags = getTemplateFlags(templateChoice as TemplateType, standardEnvironments);

    const starterManifest: FlagsManifest = {
      version: 1,
      project: {
        id: 0, // Placeholder: unlinked until first `fm apply` or `fm pull`
        name: (projectNameInput as string).trim(),
      },
      flags: initialFlags,
    };

    await writeFlagsManifest('flagsmith.yaml', starterManifest);

    p.log.success(
      pc.green(
        `✔ Created ${String(templateChoice).toUpperCase()} starter flagsmith.yaml with ${initialFlags.length} flag(s)!`
      )
    );

    console.log('\n' + pc.bold('Next steps:'));
    console.log(pc.cyan('  1. Open ') + pc.bold('flagsmith.yaml') + pc.cyan(' to review and customize your flags.'));
    console.log(pc.cyan('  2. Commit ') + pc.bold('flagsmith.yaml') + pc.cyan(' to your Git repository for PR reviews.'));
    console.log(
      pc.cyan('  3. When ready to sync to Flagsmith, add your ') +
        pc.bold('FLAGSMITH_API_KEY') +
        pc.cyan(' to .env and run ') +
        pc.bold('fm apply') +
        pc.cyan('.\n')
    );

    p.outro(pc.bold(pc.green('Setup complete! No API key was needed to get started.')));
    return;
  }

  // --------------------------------------------------------------------------
  // PATH B: Connect to Live Flagsmith Project (API Key Required)
  // --------------------------------------------------------------------------
  let apiKey = process.env.FLAGSMITH_API_KEY;
  if (!apiKey) {
    console.log(pc.dim('  🔑 Get your API key at: https://app.flagsmith.com/organisation/settings?tab=keys\n'));

    const keyInput = await p.password({
      message: 'Enter your Flagsmith Admin/Master API Key:',
      validate: (value) => {
        if (!value || value.trim().length === 0) return 'API Key is required';
      },
    });
    if (p.isCancel(keyInput)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
    apiKey = keyInput as string;
  }

  let apiUrl = process.env.FLAGSMITH_API_URL || 'https://api.flagsmith.com/api/v1';

  const deploymentType = await p.select({
    message: 'Select Flagsmith deployment:',
    options: [
      {
        value: 'cloud',
        label: 'Flagsmith Cloud (SaaS)',
        hint: 'https://api.flagsmith.com/api/v1',
      },
      {
        value: 'self-hosted',
        label: 'Self-Hosted',
        hint: 'Connect to custom instance',
      },
    ],
  });

  if (p.isCancel(deploymentType)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  if (deploymentType === 'self-hosted') {
    const urlInput = await p.text({
      message: 'Enter your self-hosted Flagsmith API URL:',
      placeholder: 'https://flags.mycompany.com/api/v1',
      validate: (v) => (!v || !v.startsWith('http') ? 'Please enter a valid HTTP(S) URL' : undefined),
    });
    if (p.isCancel(urlInput)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
    apiUrl = (urlInput as string).trim().replace(/\/+$/, '');
  }

  const s = p.spinner();
  s.start('Connecting to Flagsmith API and fetching projects...');

  let client: FlagsmithApiClient;
  let projects: any[] = [];
  try {
    client = new FlagsmithApiClient({ apiKey, baseUrl: apiUrl });
    projects = await client.getProjects();
    s.stop(`Successfully authenticated with Flagsmith. Found ${projects.length} project(s).`);
  } catch (err: any) {
    s.stop(pc.red('Authentication failed.'));
    p.log.error(pc.red(`Error: ${err.message}`));
    process.exit(1);
  }

  if (projects.length === 0) {
    p.log.warn('No projects found in this Flagsmith organization.');
    p.cancel('Please create a project in the Flagsmith dashboard first.');
    process.exit(0);
  }

  const selectedProjectId = await p.select({
    message: 'Select the Flagsmith project to bind to this repository:',
    options: projects.map((proj) => ({
      value: proj.id,
      label: proj.name,
      hint: `ID: ${proj.id}`,
    })),
  });

  if (p.isCancel(selectedProjectId)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  const project = projects.find((p) => p.id === selectedProjectId);

  const s2 = p.spinner();
  s2.start('Checking project features...');
  const existingFeatures = await client.getFeatures(selectedProjectId as number);
  const environments = await client.getEnvironments(selectedProjectId as number);
  s2.stop();

  if (existingFeatures.length > 0) {
    p.log.success(
      pc.green(`Found ${existingFeatures.length} existing flag(s). Introspecting into flagsmith.yaml...`)
    );
    await pullCommand({
      apiKey,
      apiUrl,
      projectId: String(selectedProjectId),
      file: 'flagsmith.yaml',
    });
  } else {
    // Project is brand new / has 0 flags
    const templateChoice = await p.select({
      message: 'This project has no flags yet. Choose a starter template:',
      options: [
        {
          value: 'saas',
          label: '💼 B2B / SaaS Product (Recommended)',
          hint: 'Maintenance kill-switch, billing portal, rate limits & onboarding',
        },
        {
          value: 'ai',
          label: '🤖 AI / LLM Application',
          hint: 'Model routing (Gemini/GPT), streaming, token limits & web tools',
        },
        {
          value: 'ecommerce',
          label: '🛒 E-Commerce / Consumer',
          hint: '1-click checkout, promo banner & recommendation A/B test',
        },
        {
          value: 'blank',
          label: '📄 Blank / Minimal',
          hint: 'Clean flagsmith.yaml with empty flags list',
        },
      ],
    });

    if (p.isCancel(templateChoice)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    const initialFlags = getTemplateFlags(templateChoice as TemplateType, environments);

    const starterManifest: FlagsManifest = {
      version: 1,
      project: {
        id: selectedProjectId as number,
        name: project?.name,
      },
      flags: initialFlags,
    };

    await writeFlagsManifest('flagsmith.yaml', starterManifest);
    p.log.success(
      pc.green(
        `Created ${String(templateChoice).toUpperCase()} starter flagsmith.yaml with ${initialFlags.length} flag(s)`
      )
    );
  }

  // Ask to save .env file
  const saveEnv = await p.confirm({
    message: 'Save credentials to local .env file?',
    initialValue: true,
  });

  if (!p.isCancel(saveEnv) && saveEnv) {
    const envLines = [
      `FLAGSMITH_API_KEY=${apiKey}`,
      `FLAGSMITH_API_URL=${apiUrl}`,
      `FLAGSMITH_PROJECT_ID=${selectedProjectId}`,
    ].join('\n');
    await fs.writeFile('.env', envLines + '\n', 'utf-8');
    p.log.success(pc.green('Saved .env file (ensure .env is in your .gitignore)'));
  }

  p.outro(pc.bold(pc.cyan('Setup complete! Run "fm diff" to inspect or "fm apply" to sync.')));
}
