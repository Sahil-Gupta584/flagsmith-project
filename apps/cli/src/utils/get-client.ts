import 'dotenv/config';
import { FlagsmithApiClient } from '@repo/api-client';

export interface ClientCliOptions {
  apiKey?: string;
  apiUrl?: string;
}

export function getApiClient(options: ClientCliOptions = {}): FlagsmithApiClient {
  const apiKey = options.apiKey || process.env.FLAGSMITH_API_KEY;
  const baseUrl = options.apiUrl || process.env.FLAGSMITH_API_URL || 'https://api.flagsmith.com/api/v1';

  if (!apiKey) {
    throw new Error(
      'Missing Flagsmith API Key. Please provide --api-key or set the FLAGSMITH_API_KEY environment variable.'
    );
  }

  return new FlagsmithApiClient({
    apiKey,
    baseUrl,
  });
}

