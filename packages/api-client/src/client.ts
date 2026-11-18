import type {
  CreateFeaturePayload,
  Environment,
  Feature,
  FeatureState,
  FlagsmithClientOptions,
  Project,
  Segment,
  UpdateFeaturePayload,
  UpdateFeatureStatePayload,
} from './types.js';

export class FlagsmithApiClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(options: FlagsmithClientOptions) {
    if (!options.apiKey) {
      throw new Error('Flagsmith API Key is required.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || 'https://api.flagsmith.com/api/v1').replace(/\/+$/, '');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, overrideBaseUrl?: string): Promise<T> {
    const base = overrideBaseUrl || this.baseUrl;
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    // Auth header: Flagsmith admin/master API keys typically accept 'Api-Key <key>'
    // or 'Token <key>'. If the key already has a prefix, use it directly.
    const authHeader = this.apiKey.includes(' ') 
      ? this.apiKey 
      : (this.apiKey.startsWith('ser.') || this.apiKey.length > 30 
          ? `Api-Key ${this.apiKey}` 
          : `Token ${this.apiKey}`);

    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        errorBody = response.statusText;
      }
      throw new Error(`Flagsmith API Error [${response.status} ${response.statusText}] at ${endpoint}: ${errorBody}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  /**
   * Helper to unpack paginated results if Flagsmith returns { results: [] }
   */
  private async unwrapPaginated<T>(endpoint: string): Promise<T[]> {
    const data = await this.request<any>(endpoint);
    if (data && Array.isArray(data.results)) {
      return data.results as T[];
    }
    if (Array.isArray(data)) {
      return data as T[];
    }
    return [];
  }

  // --- Projects ---

  async getProjects(): Promise<Project[]> {
    return this.unwrapPaginated<Project>('/projects/');
  }

  async getProject(projectId: number): Promise<Project> {
    return this.request<Project>(`/projects/${projectId}/`);
  }

  // --- Environments ---

  async getEnvironments(projectId: number): Promise<Environment[]> {
    return this.unwrapPaginated<Environment>(`/projects/${projectId}/environments/`);
  }

  async getEnvironment(environmentApiKey: string): Promise<Environment> {
    return this.request<Environment>(`/environments/${environmentApiKey}/`);
  }

  // --- Features ---

  async getFeatures(projectId: number): Promise<Feature[]> {
    return this.unwrapPaginated<Feature>(`/projects/${projectId}/features/?page_size=999`);
  }

  async createFeature(projectId: number, payload: CreateFeaturePayload): Promise<Feature> {
    return this.request<Feature>(`/projects/${projectId}/features/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateFeature(projectId: number, featureId: number, payload: UpdateFeaturePayload): Promise<Feature> {
    return this.request<Feature>(`/projects/${projectId}/features/${featureId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteFeature(projectId: number, featureId: number): Promise<void> {
    await this.request<void>(`/projects/${projectId}/features/${featureId}/`, {
      method: 'DELETE',
    });
  }

  // --- Feature States (Environment Overrides) ---

  async getFeatureStates(environmentApiKey: string, featureId?: number): Promise<FeatureState[]> {
    const query = featureId ? `?feature=${featureId}` : '?page_size=999';
    return this.unwrapPaginated<FeatureState>(`/environments/${environmentApiKey}/featurestates/${query}`);
  }

  async updateFeatureState(
    environmentApiKey: string,
    featureStateId: number,
    payload: UpdateFeatureStatePayload
  ): Promise<FeatureState> {
    return this.request<FeatureState>(`/environments/${environmentApiKey}/featurestates/${featureStateId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Updates an environment's feature state using the modern update-flag endpoint (__future__),
   * which automatically handles v2 Feature Versioning environments and regular environments.
   */
  async updateEnvironmentFeature(
    environmentApiKey: string,
    featureId: number,
    payload: {
      enabled?: boolean;
      value?: string | number | boolean | null;
    }
  ): Promise<any> {
    let formattedValue: any = null;
    if (payload.value !== null && payload.value !== undefined) {
      formattedValue = {
        type:
          typeof payload.value === 'number'
            ? 'integer'
            : typeof payload.value === 'boolean'
            ? 'boolean'
            : 'string',
        value: payload.value,
      };
    }

    const futureBase = this.baseUrl.replace(/\/v1$/, '/__future__');
    const updateBody: any = {
      environment_default: {
        ...(payload.enabled !== undefined ? { enabled: payload.enabled } : {}),
        ...(payload.value !== undefined ? { value: formattedValue } : {}),
      },
    };

    return this.request<any>(
      `/environments/${environmentApiKey}/features/${featureId}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(updateBody),
      },
      futureBase
    );
  }

  // --- Segments ---

  async getSegments(projectId: number): Promise<Segment[]> {
    return this.unwrapPaginated<Segment>(`/projects/${projectId}/segments/?page_size=999`);
  }
}

