import type { Environment } from '@repo/api-client';
import type { EnvironmentOverride, FlagDefinition, FlagValue } from './schema.js';

export type TemplateType = 'ai' | 'saas' | 'ecommerce' | 'blank';

function environmentOverrides(
  environments: Environment[],
  resolve: (env: Environment) => { enabled: boolean; value?: FlagValue }
): EnvironmentOverride[] {
  return environments.map((env) => ({ name: env.name, ...resolve(env) }));
}

export function getTemplateFlags(
  template: TemplateType,
  environments: Environment[]
): FlagDefinition[] {
  if (template === 'blank') {
    return [];
  }

  const isProduction = (envName: string) => /prod/i.test(envName);

  // 1. AI / LLM Product (Model Routing, Financial Controls & Tool Kill-Switches)
  if (template === 'ai') {
    return [
      {
        key: 'default_llm_model',
        description: 'Traffic split across foundation models (Cost, latency & fallback routing)',
        type: 'MULTIVARIATE',
        default_enabled: true,
        value: 'gemini-2.0-flash',
        target_metric: {
          name: 'time_to_first_token_ms',
          description: 'Streaming response latency in milliseconds (Lower is better)',
          aggregation: 'mean',
          direction: 'down',
        },
        variants: [
          { value: 'gpt-4o-mini', percentage: 30 },
        ],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
        })),
        archived: false,
      },
      {
        key: 'max_tokens_limit',
        description: 'Financial circuit breaker: Maximum completion tokens allowed per prompt',
        type: 'STANDARD',
        default_enabled: true,
        value: 2048,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: true,
          value: isProduction(env.name) ? 4096 : 1024,
        })),
        archived: false,
      },
      {
        key: 'enable_web_search_tool',
        description: 'Agent tool kill-switch: Allows LLM to call live Google search API',
        type: 'STANDARD',
        default_enabled: false,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: !isProduction(env.name),
          value: null,
        })),
        archived: false,
      },
      {
        key: 'streaming_enabled',
        description: 'Server-Sent Events (SSE) streaming; fallback to buffered for enterprise proxies',
        type: 'STANDARD',
        default_enabled: true,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
          value: null,
        })),
        archived: false,
      },
      {
        key: 'rag_top_k_chunks',
        description: 'Vector DB retrieval: Number of document chunks injected into prompt context',
        type: 'STANDARD',
        default_enabled: true,
        value: 3,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: true,
          value: isProduction(env.name) ? 6 : 3,
        })),
        archived: false,
      },
      {
        key: 'prompt_template_version',
        description: 'Remote config: Active system prompt version for instant hallucination rollbacks',
        type: 'STANDARD',
        default_enabled: true,
        value: 'v2.1',
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: true,
          value: isProduction(env.name) ? 'v2.1' : 'v2.2-rc',
        })),
        archived: false,
      },
    ];
  }

  // 2. Universal B2B / SaaS Product (Applies to ANY SaaS: Access, Quotas, SSO, Activation)
  if (template === 'saas') {
    return [
      {
        key: 'maintenance_mode',
        description: 'Emergency kill-switch: Displays a maintenance banner and blocks writes',
        type: 'STANDARD',
        default_enabled: false,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, () => ({
          enabled: false,
        })),
        archived: false,
      },
      {
        key: 'email_verification_required',
        description: 'Require new users to verify their email before accessing the workspace',
        type: 'STANDARD',
        default_enabled: true,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
        })),
        archived: false,
      },
      {
        key: 'team_invites_enabled',
        description: 'Allow workspace admins to invite teammates',
        type: 'STANDARD',
        default_enabled: true,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
        })),
        archived: false,
      },
      {
        key: 'api_rate_limit_rpm',
        description: 'Remote config: Maximum API requests per minute allowed per tenant',
        type: 'STANDARD',
        default_enabled: true,
        value: 120,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: true,
          value: isProduction(env.name) ? 600 : 120,
        })),
        archived: false,
      },
      {
        key: 'sso_enabled',
        description: 'Enterprise Single Sign-On (SAML/OIDC) login',
        type: 'STANDARD',
        default_enabled: false,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: !isProduction(env.name),
        })),
        archived: false,
      },
      {
        key: 'onboarding_checklist',
        description: 'User activation: Step-by-step onboarding checklist for new accounts',
        type: 'STANDARD',
        default_enabled: true,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
        })),
        archived: false,
      },
      {
        key: 'hero_headline',
        description: 'Landing page A/B experiment: control headline vs a benefit-led headline',
        type: 'MULTIVARIATE',
        default_enabled: true,
        value: 'Ship features faster',
        target_metric: {
          name: 'signup_completed',
          description: 'Visitor completed account signup',
          aggregation: 'occurrence',
          direction: 'up',
        },
        variants: [
          { value: 'Launch with confidence', percentage: 50 },
        ],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
        })),
        archived: false,
      },
    ];
  }

  // 3. E-Commerce / Consumer App (Checkout, A/B Testing, Promos & Cart Recovery)
  if (template === 'ecommerce') {
    return [
      {
        key: 'one_click_checkout',
        description: 'Apple Pay & Google Pay direct modal checkout flow',
        type: 'STANDARD',
        default_enabled: false,
        value: null,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: !isProduction(env.name),
          value: null,
        })),
        archived: false,
      },
      {
        key: 'announcement_banner_text',
        description: 'Global promotional message rendered at top of all pages (Remote Config)',
        type: 'STANDARD',
        default_enabled: true,
        value: 'Free worldwide shipping on orders over $50!',
        variants: [],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
          value: 'Free worldwide shipping on orders over $50!',
        })),
        archived: false,
      },
      {
        key: 'recommendation_algorithm',
        description: 'Cart upsell A/B experiment: Collaborative filtering vs Trending popularity',
        type: 'MULTIVARIATE',
        default_enabled: true,
        value: 'collaborative',
        target_metric: {
          name: 'cart_to_checkout_conversion',
          description: 'Completed purchase after viewing recommended item',
          aggregation: 'occurrence',
          direction: 'up',
        },
        variants: [
          { value: 'trending', percentage: 50 },
        ],
        environments: environmentOverrides(environments, () => ({
          enabled: true,
        })),
        archived: false,
      },
      {
        key: 'cart_abandonment_discount_pct',
        description: 'Remote config: Exit-intent recovery modal coupon discount percentage',
        type: 'STANDARD',
        default_enabled: true,
        value: 10,
        variants: [],
        environments: environmentOverrides(environments, (env) => ({
          enabled: true,
          value: isProduction(env.name) ? 10 : 20,
        })),
        archived: false,
      },
    ];
  }

  return [];
}
