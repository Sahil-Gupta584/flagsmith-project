import type {
  CreateFeaturePayload,
  Environment,
  Feature,
  FeatureState,
  MultivariateOption,
  UpdateFeaturePayload,
  UpdateFeatureStatePayload,
} from '@repo/api-client';
import type { FlagDefinition, FlagsManifest } from './schema.js';

export interface FeatureCreateAction {
  payload: CreateFeaturePayload;
  key: string;
  flagDef: FlagDefinition;
}

export interface FeatureUpdateAction {
  featureId: number;
  key: string;
  payload: UpdateFeaturePayload;
  changes: {
    property: string;
    from: any;
    to: any;
  }[];
}

export interface EnvironmentStateUpdateAction {
  featureStateId: number;
  featureId: number;
  flagKey: string;
  environmentName: string;
  environmentApiKey: string;
  payload: UpdateFeatureStatePayload;
  changes: {
    property: string;
    from: any;
    to: any;
  }[];
}

export interface FeatureDeleteAction {
  featureId: number;
  key: string;
}

export interface UntrackedFeature {
  featureId: number;
  key: string;
}

export interface ReconciliationPlan {
  projectId: number;
  creates: FeatureCreateAction[];
  updates: FeatureUpdateAction[];
  envStateUpdates: EnvironmentStateUpdateAction[];
  deletions: FeatureDeleteAction[];
  untracked: UntrackedFeature[];
  summary: {
    totalChanges: number;
    createCount: number;
    updateCount: number;
    envUpdateCount: number;
    deleteCount: number;
    untrackedCount: number;
  };
}

export function computePlan(
  manifest: FlagsManifest,
  remoteFeatures: Feature[],
  remoteEnvironments: Environment[],
  remoteStatesByEnv: Map<string, FeatureState[]>,
  options: { prune?: boolean } = {}
): ReconciliationPlan {
  const creates: FeatureCreateAction[] = [];
  const updates: FeatureUpdateAction[] = [];
  const envStateUpdates: EnvironmentStateUpdateAction[] = [];
  const deletions: FeatureDeleteAction[] = [];
  const untracked: UntrackedFeature[] = [];

  const remoteFeatureMap = new Map<string, Feature>();
  for (const f of remoteFeatures) {
    remoteFeatureMap.set(f.name, f);
  }

  const yamlFeatureMap = new Map<string, FlagDefinition>();
  for (const f of manifest.flags) {
    yamlFeatureMap.set(f.key, f);
  }

  // 1. Determine Creates and Feature Updates
  for (const flagDef of manifest.flags) {
    const remote = remoteFeatureMap.get(flagDef.key);

    if (!remote) {
      // Must CREATE this feature
      const multivariate_options: MultivariateOption[] =
        flagDef.type === 'MULTIVARIATE' && flagDef.variants
          ? flagDef.variants.map((v) => ({
            type: typeof v.value === 'number' ? 'int' : typeof v.value === 'boolean' ? 'bool' : 'unicode',
            string_value: typeof v.value === 'string' ? v.value : null,
            integer_value: typeof v.value === 'number' ? v.value : null,
            boolean_value: typeof v.value === 'boolean' ? v.value : null,
            default_percentage_allocation: v.percentage,
          }))
          : [];

      creates.push({
        key: flagDef.key,
        flagDef,
        payload: {
          name: flagDef.key,
          description: flagDef.description || '',
          type: flagDef.type || 'STANDARD',
          default_enabled: flagDef.default_enabled ?? false,
          initial_value: flagDef.value ?? null,
          multivariate_options,
        },
      });
    } else {
      // Check for updates to the feature base definition
      const changes: { property: string; from: any; to: any }[] = [];
      const payload: UpdateFeaturePayload = {};

      if (flagDef.description !== undefined && flagDef.description !== remote.description) {
        changes.push({
          property: 'description',
          from: remote.description,
          to: flagDef.description,
        });
        payload.description = flagDef.description;
      }

      if (
        flagDef.default_enabled !== undefined &&
        flagDef.default_enabled !== remote.default_enabled
      ) {
        changes.push({
          property: 'default_enabled',
          from: remote.default_enabled,
          to: flagDef.default_enabled,
        });
        payload.default_enabled = flagDef.default_enabled;
      }

      if (changes.length > 0) {
        updates.push({
          featureId: remote.id,
          key: flagDef.key,
          payload,
          changes,
        });
      }

      // Check environment overrides for this existing feature
      for (const env of remoteEnvironments) {
        const envOverride = flagDef.environments.find((item) => item.name === env.name);
        if (!envOverride) continue;

        const liveStates = remoteStatesByEnv.get(env.name) || [];
        const liveState = liveStates.find((s) => s.feature === remote.id);

        if (liveState) {
          const envChanges: { property: string; from: any; to: any }[] = [];
          const statePayload: UpdateFeatureStatePayload = {};

          if (liveState.enabled !== envOverride.enabled) {
            envChanges.push({
              property: 'enabled',
              from: liveState.enabled,
              to: envOverride.enabled,
            });
            statePayload.enabled = envOverride.enabled;
          }

          const desiredValue =
            envOverride.value !== undefined ? envOverride.value : (flagDef.value ?? null);

          if (liveState.feature_state_value !== desiredValue) {
            envChanges.push({
              property: 'value',
              from: liveState.feature_state_value,
              to: desiredValue,
            });
            statePayload.feature_state_value = desiredValue;
          }

          if (envChanges.length > 0) {
            envStateUpdates.push({
              featureStateId: liveState.id,
              featureId: remote.id,
              flagKey: flagDef.key,
              environmentName: env.name,
              environmentApiKey: env.api_key,
              payload: statePayload,
              changes: envChanges,
            });
          }
        }
      }
    }
  }

    // 2. Identify Remote Features to Delete (Default 1-to-1 Mirror, or Untracked if prune: false)
    const shouldPrune = options.prune !== false;
    for (const remote of remoteFeatures) {
      if (!yamlFeatureMap.has(remote.name)) {
        if (shouldPrune) {
          deletions.push({
            featureId: remote.id,
            key: remote.name,
          });
        } else {
          untracked.push({
            featureId: remote.id,
            key: remote.name,
          });
        }
      }
    }

        const totalChanges =
          creates.length + updates.length + envStateUpdates.length + deletions.length;

        return {
          projectId: manifest.project.id,
          creates,
          updates,
          envStateUpdates,
          deletions,
          untracked,
          summary: {
            totalChanges,
            createCount: creates.length,
            updateCount: updates.length,
            envUpdateCount: envStateUpdates.length,
            deleteCount: deletions.length,
            untrackedCount: untracked.length,
          },
        };
      }

      export function generateManifestFromRemote(
        projectId: number,
        projectName: string,
        remoteFeatures: Feature[],
        remoteEnvironments: Environment[],
        remoteStatesByEnv: Map<string, FeatureState[]>
      ): FlagsManifest {
        const flags: FlagDefinition[] = remoteFeatures.map((f) => {
          const environments: FlagDefinition['environments'] = [];

          for (const env of remoteEnvironments) {
            const states = remoteStatesByEnv.get(env.name) || [];
            const st = states.find((s) => s.feature === f.id);
            if (st) {
              environments.push({
                name: env.name,
                enabled: st.enabled,
                value: st.feature_state_value ?? null,
              });
            }
          }

          return {
            key: f.name,
            description: f.description || '',
            type: f.type || 'STANDARD',
            default_enabled: f.default_enabled,
            value: f.initial_value ?? null,
            variants: (f.multivariate_options ?? []).map((option) => ({
              value: option.string_value ?? option.integer_value ?? option.boolean_value ?? null,
              percentage: option.default_percentage_allocation,
            })),
            environments,
            archived: f.is_archived || false,
          };
        });

        return {
          version: 1,
          project: {
            id: projectId,
            name: projectName,
          },
          flags,
        };
      }

