# Flagsmith YAML (fm) 🚩

> Declarative, Prisma/Drizzle-style bi-directional synchronization and drift-aware GitOps management for Flagsmith feature flags.

---

## ⚡ The Problem & Philosophy

* **Kubernetes GitOps (`kubectl apply`)** assumes Git is the absolute source of truth. If someone touches production directly, it wipes out their changes.
* **In Feature Flagging, emergency UI toggles are legitimate business operations** (e.g. SREs flipping a kill-switch in the dashboard at 2:00 AM).
* **Flagsmith YAML** brings the **Prisma / Drizzle CLI workflow** to Flagsmith:
  1. `fm pull` introspects your remote Flagsmith project into a clean `flagsmith.yaml`.
  2. `fm diff` previews changes and detects dashboard drift with colored terminal output.
  3. `fm apply` safely reconciles desired state—prompting for resolution if someone altered flags in the UI out-of-band!

---

## 📦 Monorepo Architecture (Turborepo + npm)

```text
├── apps/
│   └── cli/             # Interactive CLI tool ('fm' command)
└── packages/
    ├── api-client/      # Typed Flagsmith Management REST API client
    ├── core/            # State reconciliation, Zod schema, YAML parser & drift engine
    └── tsconfig/        # Shared TypeScript configurations
```

---

## 🚀 Quickstart

### 1. Build the Monorepo
```bash
npm install
npm run build
```

### 2. Run the Test Suite
```bash
npm run test
```

### 3. Initialize your Project
```bash
npm run fm -- init
```
This wizard provides two paths:
1. **🚀 Start from a Starter Template (Offline / Zero API key needed)**:
   Scaffold production-grade B2B SaaS, AI/LLM, or E-Commerce flag architectures directly into your repository.
2. **🔗 Connect to a live Flagsmith project**:
   Authenticate via API key (SaaS or Self-Hosted) to introspect live flags or bind a remote project.

---

## 🛠 Commands

### `fm init`
Interactive onboarding wizard with `@clack/prompts`. Allows zero-credential offline scaffolding from domain templates or live project introspection.

### `fm pull`
Reverse-sync live Flagsmith features, default values, and environment overrides directly into `flagsmith.yaml`.
```bash
npm run fm -- pull
```

### `fm diff` (alias: `fm status`)
Performs 1-to-1 comparison between local `flagsmith.yaml` and live Flagsmith remote state. Highlights:
- `+` Green: Flags to create
- `~` Yellow: Flags/environment overrides to update
- `-` Red: Flags to delete (present in Flagsmith dashboard, missing in local YAML)
```bash
npm run fm -- diff

# Exclude missing flags from planned deletions
npm run fm -- diff --no-prune
```

### `fm apply` (alias: `fm push`)
Reconciles `flagsmith.yaml` to live Flagsmith project (1-to-1 mirror):
```bash
# Preview changes safely without applying
npm run fm -- apply --dry-run

# Interactively review plan and confirm application (prompts before deletions)
npm run fm -- apply

# Auto-confirm without prompting (useful in CI/CD)
npm run fm -- apply -y

# Keep remote flags that are absent from YAML (do not delete)
npm run fm -- apply --no-prune
```

### `fm validate [file]`
Offline syntax and semantic validation using Zod:
```bash
npm run fm -- validate flagsmith.yaml
```

### `fm schema`
Generate `flagsmith.schema.json` from the Zod manifest schema for IDE autocompletion:
```bash
npm run fm -- schema

# Print to stdout instead
npm run fm -- schema --print
```
Add the generated schema to your YAML for autocomplete:
```yaml
# yaml-language-server: $schema=./flagsmith.schema.json
```

The schema is also served directly from this repository:
```
https://cdn.jsdelivr.net/gh/Sahil-Gupta584/flagsmith-project@main/flagsmith.schema.json
```

---

## 📄 Manifest Example (`flagsmith.yaml`)

```yaml
version: 1
project:
  id: 1042
  name: "My Core Application"

flags:
  - key: checkout_v2
    description: "Redesigned checkout flow with one-click payment"
    type: STANDARD
    default_enabled: false
    value: null
    environments:
      - name: development
        enabled: true
      - name: staging
        enabled: true
      - name: production
        enabled: false

  - key: hero_button_color
    description: "Multivariate A/B experiment on CTA button color"
    type: MULTIVARIATE
    default_enabled: true
    value: "blue"
    target_metric:
      name: "checkout_conversion_rate"
      description: "User completed payment after clicking hero CTA"
      aggregation: "occurrence"
      direction: "up"
    variants:
      - value: "green"
        percentage: 50
    environments:
      - name: production
        enabled: true
```

### How environment overrides work

`environments` is a list, and each item targets one environment by name:

```yaml
environments:
  - name: development     # must match the Flagsmith environment name exactly
    enabled: true
  - name: production
    enabled: false
    value: "custom-production-value"
```

- `name` selects the environment. Names are case-sensitive.
- `enabled` controls whether the flag is on in that environment.
- `value` is optional. If omitted, the environment inherits the flag's root `value`. Set it only when that environment needs a different value.

For multivariate flags, the root `value` is the control arm. Environment values override the control in that environment; experiment variants and their traffic split remain feature-level. Duplicate environment names in one flag are rejected.

### How multivariate experiments work

The root `value` is the **control**. `variants` contains only the **challengers**:

```yaml
- key: hero_button_color
  type: MULTIVARIATE
  value: "blue"                 # control
  variants:
    - value: "green"            # challenger
      percentage: 50
```

The challenger gets 50%, so the control receives the remaining 50%.

With two challengers:

```yaml
  value: "control"
  variants:
    - value: "variant-a"
      percentage: 30
    - value: "variant-b"
      percentage: 30
# control receives 40%
```

Variant percentages must total **100% or less**. The control is not listed in `variants`; repeating the control value there is rejected.

