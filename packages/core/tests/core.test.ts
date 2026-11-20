import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePlan,
  generateManifestFromRemote,
  getTemplateFlags,
  parseYamlContent,
  serializeFlagsManifest,
  type FlagsManifest,
} from '../src/index.js';
import type { Environment, Feature, FeatureState } from '@repo/api-client';

test('YAML Parser - validates correct manifest', () => {
  const yaml = `
version: 1
project:
  id: 100
  name: "Test App"
flags:
  - key: test_feature
    description: "Sample flag"
    default_enabled: false
    environments:
      - name: dev
        enabled: true
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, true);
  assert.equal(res.data?.flags.length, 1);
  assert.equal(res.data?.flags[0].key, 'test_feature');
  assert.equal(res.data?.flags[0].environments[0].name, 'dev');
  assert.equal(res.data?.flags[0].environments[0].enabled, true);
});

test('YAML Parser - catches duplicate environment overrides', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: test_feature
    environments:
      - name: production
        enabled: true
      - name: production
        enabled: false
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes("duplicate environment override for 'production'")));
});

test('YAML Parser - catches duplicate keys', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: dup_key
  - key: dup_key
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes("Duplicate flag key found: 'dup_key'")));
});

test('YAML Parser - accepts multivariate allocation below 100% for control remainder', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: cta_experiment
    type: MULTIVARIATE
    value: "Control"
    variants:
      - value: "A"
        percentage: 30
      - value: "B"
        percentage: 30
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, true);
  assert.equal(res.data?.flags[0].value, 'Control');
  assert.equal(res.data?.flags[0].variants.length, 2);
});

test('YAML Parser - catches multivariate allocation over 100%', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: cta_experiment
    type: MULTIVARIATE
    value: "Control"
    variants:
      - value: "A"
        percentage: 60
      - value: "B"
        percentage: 60
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes('must not exceed 100%')));
});

test('YAML Parser - rejects a variant that duplicates the control value', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: cta_experiment
    type: MULTIVARIATE
    value: "Control"
    variants:
      - value: "Control"
        percentage: 50
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes('duplicates the control value')));
});

test('YAML Parser - rejects a MULTIVARIATE flag without challengers', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: empty_experiment
    type: MULTIVARIATE
    value: "Control"
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes('has no variants')));
});

test('YAML Parser - rejects variants on a STANDARD flag', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: simple_flag
    variants:
      - value: "A"
        percentage: 50
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes('set type: MULTIVARIATE')));
});

test('YAML Parser - parses and validates target_metric for experiments', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: search_v2
    type: MULTIVARIATE
    target_metric:
      name: search_clickthrough_rate
      description: "User clicked top-3 results"
      aggregation: occurrence
      direction: up
    variants:
      - value: "bm25"
        percentage: 40
      - value: "vector"
        percentage: 40
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, true);
  assert.equal(res.data?.flags[0].target_metric?.name, 'search_clickthrough_rate');
  assert.equal(res.data?.flags[0].target_metric?.aggregation, 'occurrence');
  assert.equal(res.data?.flags[0].target_metric?.direction, 'up');
});

test('YAML Serializer - includes schema directive for IDE autocomplete', () => {
  const manifest: FlagsManifest = {
    version: 1,
    project: { id: 100 },
    flags: [],
  };
  const yaml = serializeFlagsManifest(manifest);
  assert.match(yaml, /^# yaml-language-server: \$schema=https:\/\/cdn\.jsdelivr\.net\//);
  assert.match(yaml, /# Run "fm diff" to preview/);
});

test('Templates - multivariate flags use challenger-only variants', () => {
  const environments: Environment[] = [
    { id: 1, name: 'Production', api_key: 'prod_key', project: 100 },
    { id: 2, name: 'Development', api_key: 'dev_key', project: 100 },
  ];

  for (const template of ['ai', 'saas', 'ecommerce'] as const) {
    const flags = getTemplateFlags(template, environments);
    const multivariateFlags = flags.filter((flag) => flag.type === 'MULTIVARIATE');

    assert.ok(multivariateFlags.length > 0, `${template} should include an experiment`);
    for (const flag of multivariateFlags) {
      assert.ok(flag.variants.length > 0, `${flag.key} should have a challenger`);
      assert.ok(
        flag.variants.reduce((sum, variant) => sum + variant.percentage, 0) <= 100,
        `${flag.key} allocations should leave room for the control`
      );
      assert.ok(
        flag.variants.every((variant) => variant.value !== flag.value),
        `${flag.key} should not repeat the control in variants`
      );
    }
  }
});

test('Templates - SaaS uses generic flags and a single challenger headline', () => {
  const environments: Environment[] = [
    { id: 1, name: 'Production', api_key: 'prod_key', project: 100 },
    { id: 2, name: 'Development', api_key: 'dev_key', project: 100 },
  ];
  const flags = getTemplateFlags('saas', environments);
  const keys = flags.map((flag) => flag.key);

  assert.ok(keys.includes('hero_headline'));
  assert.ok(keys.includes('email_verification_required'));
  assert.ok(keys.includes('team_invites_enabled'));
  assert.ok(!keys.includes('new_billing_portal'));
  assert.ok(!keys.includes('navigation_redesign'));

  const hero = flags.find((flag) => flag.key === 'hero_headline');
  assert.ok(hero);
  assert.equal(hero.value, 'Ship features faster');
  assert.deepEqual(hero.variants, [
    { value: 'Launch with confidence', percentage: 50 },
  ]);
  assert.equal(
    hero.environments.find((env) => env.name === 'Production')?.value,
    undefined
  );
});

test('Reconciler - detects new feature to create', () => {
  const manifest: FlagsManifest = {
    version: 1,
    project: { id: 100 },
    flags: [
      {
        key: 'new_flag',
        description: 'New feature',
        type: 'STANDARD',
        default_enabled: true,
        value: null,
        variants: [],
        environments: [],
        archived: false,
      },
    ],
  };

  const remoteFeatures: Feature[] = [];
  const remoteEnvs: Environment[] = [{ id: 1, name: 'production', api_key: 'prod_key', project: 100 }];
  const remoteStates = new Map<string, FeatureState[]>();

  const plan = computePlan(manifest, remoteFeatures, remoteEnvs, remoteStates);
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].key, 'new_flag');
  assert.equal(plan.summary.createCount, 1);
  assert.equal(plan.summary.totalChanges, 1);
});

test('Reconciler - creates multivariate feature with control and challenger options', () => {
  const manifest: FlagsManifest = {
    version: 1,
    project: { id: 100 },
    flags: [
      {
        key: 'hero_headline',
        description: '',
        type: 'MULTIVARIATE',
        default_enabled: true,
        value: 'Ship features faster',
        variants: [
          { value: 'Launch with confidence', percentage: 30 },
        ],
        environments: [],
        archived: false,
      },
    ],
  };

  const plan = computePlan(
    manifest,
    [],
    [{ id: 1, name: 'production', api_key: 'prod_key', project: 100 }],
    new Map()
  );

  assert.equal(plan.creates.length, 1);
  assert.equal(plan.creates[0].payload.initial_value, 'Ship features faster');
  assert.deepEqual(plan.creates[0].payload.multivariate_options, [
    {
      type: 'unicode',
      string_value: 'Launch with confidence',
      integer_value: null,
      boolean_value: null,
      default_percentage_allocation: 30,
    },
  ]);
});

test('Reconciler - detects environment override changes', () => {
  const manifest: FlagsManifest = {
    version: 1,
    project: { id: 100 },
    flags: [
      {
        key: 'existing_flag',
        description: '',
        type: 'STANDARD',
        default_enabled: false,
        value: null,
        variants: [],
        environments: [
          {
            name: 'production',
            enabled: true,
            value: 'v2',
          },
        ],
        archived: false,
      },
    ],
  };

  const remoteFeatures: Feature[] = [
    {
      id: 42,
      name: 'existing_flag',
      type: 'STANDARD',
      default_enabled: false,
      initial_value: null,
      description: '',
    },
  ];

  const remoteEnvs: Environment[] = [
    { id: 1, name: 'production', api_key: 'prod_key', project: 100 },
  ];

  const remoteStates = new Map<string, FeatureState[]>([
    [
      'production',
      [
        {
          id: 501,
          feature: 42,
          environment: 1,
          enabled: false, // live is disabled, YAML wants enabled: true
          feature_state_value: 'v1', // live is v1, YAML wants v2
        },
      ],
    ],
  ]);

  const plan = computePlan(manifest, remoteFeatures, remoteEnvs, remoteStates);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.envStateUpdates.length, 1);
  assert.equal(plan.envStateUpdates[0].flagKey, 'existing_flag');
  assert.equal(plan.envStateUpdates[0].environmentName, 'production');
  assert.equal(plan.envStateUpdates[0].payload.enabled, true);
  assert.equal(plan.envStateUpdates[0].payload.feature_state_value, 'v2');
});

test('Reconciler - pull produces a named environment array', () => {
  const remoteFeatures: Feature[] = [
    {
      id: 42,
      name: 'hero_headline',
      type: 'STANDARD',
      default_enabled: true,
      initial_value: 'Ship features faster',
      description: '',
    },
  ];
  const remoteEnvs: Environment[] = [
    { id: 1, name: 'Production', api_key: 'prod_key', project: 100 },
    { id: 2, name: 'Development', api_key: 'dev_key', project: 100 },
  ];
  const remoteStates = new Map<string, FeatureState[]>([
    [
      'Production',
      [
        {
          id: 501,
          feature: 42,
          environment: 1,
          enabled: true,
          feature_state_value: 'Ship features faster',
        },
      ],
    ],
    [
      'Development',
      [
        {
          id: 502,
          feature: 42,
          environment: 2,
          enabled: true,
          feature_state_value: 'Ship features faster (dev)',
        },
      ],
    ],
  ]);

  const manifest = generateManifestFromRemote(
    100,
    'Demo',
    remoteFeatures,
    remoteEnvs,
    remoteStates
  );

  assert.deepEqual(manifest.flags[0].environments, [
    { name: 'Production', enabled: true, value: 'Ship features faster' },
    { name: 'Development', enabled: true, value: 'Ship features faster (dev)' },
  ]);
});

test('Reconciler - environment value inherits flag value when omitted', () => {
  const manifest: FlagsManifest = {
    version: 1,
    project: { id: 100 },
    flags: [
      {
        key: 'hero_headline',
        description: '',
        type: 'STANDARD',
        default_enabled: true,
        value: 'Ship features faster',
        variants: [],
        environments: [
          {
            name: 'production',
            enabled: true,
          },
        ],
        archived: false,
      },
    ],
  };

  const remoteFeatures: Feature[] = [
    {
      id: 42,
      name: 'hero_headline',
      type: 'STANDARD',
      default_enabled: true,
      initial_value: 'Ship features faster',
      description: '',
    },
  ];
  const remoteEnvs: Environment[] = [
    { id: 1, name: 'production', api_key: 'prod_key', project: 100 },
  ];
  const remoteStates = new Map<string, FeatureState[]>([
    [
      'production',
      [
        {
          id: 501,
          feature: 42,
          environment: 1,
          enabled: true,
          feature_state_value: 'Old headline',
        },
      ],
    ],
  ]);

  const plan = computePlan(manifest, remoteFeatures, remoteEnvs, remoteStates);
  assert.equal(plan.envStateUpdates.length, 1);
  assert.equal(
    plan.envStateUpdates[0].payload.feature_state_value,
    'Ship features faster'
  );
});

  test('Reconciler - marks absent remote flags for deletion by default (1-to-1 mirror)', () => {
    const manifest: FlagsManifest = {
      version: 1,
      project: { id: 100 },
      flags: [],
    };

    const remoteFeatures: Feature[] = [
      {
        id: 88,
        name: 'stale_flag',
        type: 'STANDARD',
        default_enabled: true,
        initial_value: null,
        description: '',
      },
    ];

    // Default: 1-to-1 mirror marks absent remote flags for deletion
    const plan = computePlan(manifest, remoteFeatures, [], new Map());
    assert.equal(plan.deletions.length, 1);
    assert.equal(plan.deletions[0].key, 'stale_flag');
    assert.equal(plan.untracked.length, 0);

    // With prune: false (explicitly preserve untracked flags)
    const noPrunePlan = computePlan(manifest, remoteFeatures, [], new Map(), { prune: false });
    assert.equal(noPrunePlan.deletions.length, 0);
    assert.equal(noPrunePlan.untracked.length, 1);
    assert.equal(noPrunePlan.untracked[0].key, 'stale_flag');
  });
