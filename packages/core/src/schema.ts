import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const FlagValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]).describe('Remote configuration value (string, number, boolean, or null)');

export const MultivariateVariantSchema = z.object({
  value: FlagValueSchema.describe('Variant value served to clients'),
  percentage: z.number().min(0).max(100).describe('Percentage of traffic allocated to this variant (0-100)'),
}).describe('Traffic split variant for multivariate experiments');

export const EnvironmentOverrideSchema = z.object({
  enabled: z.boolean().describe('Whether the flag is enabled in this environment'),
  value: FlagValueSchema.optional().default(null).describe('Environment-specific remote config override value'),
}).describe('Environment-specific flag state and value overrides');

export const ExperimentMetricSchema = z.object({
  name: z.string().min(1, 'Metric name is required').describe('Unique name of the experiment metric event (e.g. signup_completed)'),
  description: z.string().optional().describe('Description of the business outcome measured'),
  aggregation: z.enum(['occurrence', 'count', 'sum', 'mean']).optional().default('occurrence').describe('How Flagsmith computes the metric (occurrence, count, sum, mean)'),
  direction: z.enum(['up', 'down', 'informational']).optional().default('up').describe('Expected direction of improvement (up: higher is better, down: lower is better, informational)'),
}).describe('Flagsmith target metric specifying the conversion event and success criteria');

export const FlagDefinitionSchema = z.object({
  key: z.string().min(1, 'Flag key is required').describe('Unique identifier of the feature flag (e.g. checkout_v2, maintenance_mode)'),
  description: z.string().optional().default('').describe('Human-readable description explaining the purpose of this flag'),
  type: z.enum(['STANDARD', 'MULTIVARIATE']).optional().default('STANDARD').describe('Flag type: STANDARD (simple toggle/remote config) or MULTIVARIATE (A/B experiment)'),
  default_enabled: z.boolean().optional().default(false).describe('Default baseline state across all environments before overrides'),
  value: FlagValueSchema.optional().default(null).describe('Default remote configuration value before overrides'),
  variants: z.array(MultivariateVariantSchema).optional().default([]).describe('Traffic split variants for MULTIVARIATE experiment flags (must sum to 100%)'),
  target_metric: ExperimentMetricSchema.optional().describe('Flagsmith target experiment metric'),
  environments: z.record(z.string(), EnvironmentOverrideSchema).optional().default({}).describe('Environment-specific overrides (e.g. Production: { enabled: true })'),
  archived: z.boolean().optional().default(false).describe('Whether this feature flag is archived'),
}).describe('Feature flag or experiment definition');

export const FlagsManifestSchema = z.object({
  version: z.number().default(1).describe('Flagsmith YAML schema version (default: 1)'),
  project: z.object({
    id: z.number().int().min(0, 'Project ID must be a non-negative integer').describe('Flagsmith Project ID (0 indicates unlinked placeholder)'),
    name: z.string().optional().describe('Flagsmith Project Name for readability'),
  }).describe('Flagsmith project metadata'),
  flags: z.array(FlagDefinitionSchema).describe('List of declared feature flags, remote configurations, and multivariate experiments'),
}).describe('Root Flagsmith YAML configuration manifest');

export type FlagValue = z.infer<typeof FlagValueSchema>;
export type MultivariateVariant = z.infer<typeof MultivariateVariantSchema>;
export type EnvironmentOverride = z.infer<typeof EnvironmentOverrideSchema>;
export type ExperimentMetric = z.infer<typeof ExperimentMetricSchema>;
export type FlagDefinition = z.infer<typeof FlagDefinitionSchema>;
export type FlagDefinitionInput = z.input<typeof FlagDefinitionSchema>;
export type FlagsManifest = z.infer<typeof FlagsManifestSchema>;
export type FlagsManifestInput = z.input<typeof FlagsManifestSchema>;

export function getFlagsManifestJsonSchema(): Record<string, unknown> {
  const schema = zodToJsonSchema(FlagsManifestSchema, {
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  return {
    ...schema,
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Flagsmith YAML Manifest',
    description:
      'Declarative Flagsmith feature flag and experiment manifest (flagsmith.yaml)',
  };
}

export async function writeFlagsJsonSchema(filePath: string): Promise<void> {
  const schema = getFlagsManifestJsonSchema();
  await fs.writeFile(filePath, JSON.stringify(schema, null, 2) + '\n', 'utf-8');
}

