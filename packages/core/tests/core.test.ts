import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePlan,
  parseYamlContent,
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
      dev:
        enabled: true
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, true);
  assert.equal(res.data?.flags.length, 1);
  assert.equal(res.data?.flags[0].key, 'test_feature');
  assert.equal(res.data?.flags[0].environments['dev'].enabled, true);
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

test('YAML Parser - catches multivariate percentage sum != 100%', () => {
  const yaml = `
version: 1
project:
  id: 100
flags:
  - key: cta_experiment
    type: MULTIVARIATE
    variants:
      - value: "A"
        percentage: 30
      - value: "B"
        percentage: 30
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, false);
  assert.ok(res.errors?.some((e) => e.includes('must equal 100%')));
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
        percentage: 50
      - value: "vector"
        percentage: 50
`;
  const res = parseYamlContent(yaml);
  assert.equal(res.success, true);
  assert.equal(res.data?.flags[0].target_metric?.name, 'search_clickthrough_rate');
  assert.equal(res.data?.flags[0].target_metric?.aggregation, 'occurrence');
  assert.equal(res.data?.flags[0].target_metric?.direction, 'up');
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
        environments: {},
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
        environments: {
          production: {
            enabled: true,
            value: 'v2',
          },
        },
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
