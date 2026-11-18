export type FeatureType = 'STANDARD' | 'MULTIVARIATE';

export interface MultivariateOption {
  id?: number;
  type: 'unicode' | 'int' | 'bool';
  string_value?: string | null;
  integer_value?: number | null;
  boolean_value?: boolean | null;
  default_percentage_allocation: number;
}

export interface Project {
  id: number;
  name: string;
  organisation: number;
}

export interface Environment {
  id: number;
  name: string;
  api_key: string;
  project: number;
  description?: string | null;
}

export interface Feature {
  id: number;
  name: string;
  type: FeatureType;
  default_enabled: boolean;
  initial_value: string | number | boolean | null;
  description: string | null;
  multivariate_options?: MultivariateOption[];
  is_archived?: boolean;
}

export interface CreateFeaturePayload {
  name: string;
  type?: FeatureType;
  default_enabled?: boolean;
  initial_value?: string | number | boolean | null;
  description?: string | null;
  multivariate_options?: MultivariateOption[];
}

export interface UpdateFeaturePayload {
  name?: string;
  type?: FeatureType;
  default_enabled?: boolean;
  initial_value?: string | number | boolean | null;
  description?: string | null;
  multivariate_options?: MultivariateOption[];
  is_archived?: boolean;
}

export interface FeatureState {
  id: number;
  feature: number; // feature ID
  environment: number; // environment ID
  enabled: boolean;
  feature_state_value: string | number | boolean | null;
  multivariate_feature_state_values?: any[];
  updated_at?: string;
}

export interface UpdateFeatureStatePayload {
  enabled?: boolean;
  feature_state_value?: string | number | boolean | null;
  multivariate_feature_state_values?: any[];
}

export interface Segment {
  id: number;
  name: string;
  description?: string | null;
  project: number;
}

export interface FlagsmithClientOptions {
  apiKey: string;
  baseUrl?: string; // defaults to https://api.flagsmith.com/api/v1
}

