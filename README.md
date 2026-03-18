[![dev workflow](https://github.com/glauciolabs/video-request-manager/actions/workflows/develop.yml/badge.svg?branch=develop)](https://github.com/glauciolabs/video-request-manager/actions/workflows/develop.yml)
[![production workflow](https://github.com/glauciolabs/video-request-manager/actions/workflows/production.yml/badge.svg?branch=master)](https://github.com/glauciolabs/video-request-manager/actions/workflows/production.yml)
# Video Request Manager

Video Request Manager is a microservices-based platform for collecting, tracking, and operating video processing requests.

It includes:
- A client-facing form application (`frontend`)
- A separate admin portal (`admin-frontend`)
- A Node.js/Express backend split into domain services
- A Kubernetes GitOps deployment model with Kustomize + Argo CD

## Architecture

### Frontend
- `frontend` (Next.js): public intake form and tracking flow
- `admin-frontend` (Next.js): admin dashboard, order operations, and reports

### Backend services
- `gateway`: API gateway, auth mode routing, rate limiting, request proxy
- `user-service`: auth/profile endpoints and role-aware user operations
- `order-service`: order intake, status lifecycle, SLA/time calculations, tracking
- `notification-service`: Telegram and SMTP delivery
- `sla-service`: SLA policy endpoints/logic
- `report-service`: metrics and reporting endpoints

### Data backends
- PostgreSQL (default)
- Cloudflare D1 (optional, env-driven)

### Security model
- JWT for user auth
- Internal service token (`x-service-token`) between services
- Turnstile support for form/admin login protection
- Optional Entra ID integration for admin authentication

## Repository layout

```text
/frontend
/admin-frontend
/gateway
/services
  /order-service
  /user-service
  /notification-service
  /sla-service
  /report-service
/container
  /(mirrored build context used by CI builds)
/app
  /base
  /develop
  /production
/database
/scripts
/docs
```

## Key capabilities

- Client intake form with required-field validation and tracking
- Admin dashboard with operational visibility
- Order lifecycle and SLA-by-priority behavior
- Email + Telegram notifications
- Tracking code flow for customer follow-up
- i18n support in the client UI (`pt-BR` and `en-US`)
- GitOps deployment with environment overlays (`develop` and `production`)

## Prerequisites

- Node.js 22+
- npm 10+
- Docker + Docker Compose
- kubectl (for cluster operations)
- Access to Argo CD and GHCR for deployment pipelines

## Local development (workspace mode)

1. Install dependencies:
```bash
npm install
```

2. Create your env file:
```bash
cp .env.example .env
```

3. Start PostgreSQL only:
```bash
docker compose up -d postgres
```

4. Run services in separate terminals:
```bash
npm run dev:gateway
npm run dev:user
npm run dev:order
npm run dev:notification
npm run dev:sla
npm run dev:report
npm run dev:frontend
npm run dev:admin-frontend
```

Default local URLs:
- Client app: `http://localhost:3000`
- Admin app: `http://localhost:3006`
- Gateway API: `http://localhost:8080`

## Local containerized run (full stack)

Use the container compose file that mirrors CI build context:

```bash
cp .env.example .env
docker compose -f container/compose.yaml build
docker compose -f container/compose.yaml up -d
docker compose -f container/compose.yaml ps
```

## Configuration

All major runtime options are documented in `.env.example`, including:
- auth modes (`AUTH_MODE=none|local|entra`)
- Entra settings (`ENTRA_*`, `NEXT_PUBLIC_ENTRA_*`)
- Turnstile settings (`TURNSTILE_*`)
- SMTP and Telegram notification settings
- storage backend switch (`ORDER_DATA_BACKEND` / `DATA_BACKEND`)
- D1 credentials (`D1_ACCOUNT_ID`, `D1_DATABASE_ID`, `D1_API_TOKEN`)

## CI/CD and GitOps

This repository uses reusable pipeline logic from `glauciolabs/core-pipeline`.

Workflows:
- `.github/workflows/develop.yml`: all branches except `master`
- `.github/workflows/master.yml`: `master` branch (production path)

Deployment mode:
- Argo CD + Kustomize overlays
- `app/develop`
- `app/production`

### Required GitHub secrets

Core:
- `ARGOCD_SERVER`
- `ARGOCD_TOKEN`
- `GITOPS_SSH_PRIVATE_KEY` (if GitOps repo access requires it)
- `CLUSTER_DEVELOP`
- `CLUSTER_PRODUCTION`

Registry (GHCR):
- `REGISTRY=ghcr.io` (enforced in project workflows)
- `REGISTRY_USERNAME` = `github.repository_owner` (enforced)
- `REGISTRY_PASSWORD` = `github.token` (enforced)

Notes:
- Workflows are configured with `packages: write` permission.
- GHCR credentials are intentionally fixed in workflow definitions.
- Build metadata includes OCI source labeling (`org.opencontainers.image.source`) through the reusable core pipeline build script.

## GHCR package behavior

Images are published under the organization scope, for example:
- `ghcr.io/glauciolabs/video-request-manager-frontend`

To make packages appear under the repository's **Published packages**, connect each package to this repository in GitHub Package settings.

For container image pull in private GHCR from Kubernetes, create an image pull secret in each target namespace:

```bash
kubectl -n video-request-manager-develop create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username='<github-username>' \
  --docker-password='<pat-with-read:packages>' \
  --docker-email='<email>'

kubectl -n video-request-manager-production create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username='<github-username>' \
  --docker-password='<pat-with-read:packages>' \
  --docker-email='<email>'
```

## Kubernetes and secrets

- Base manifests: `app/base`
- Environment overlays: `app/develop`, `app/production`
- SealedSecret files are maintained per environment and should be generated from non-committed plain secrets.

Recommended pattern:
1. Keep plaintext secret manifests out of git history.
2. Generate SealedSecrets per target namespace/cluster controller.
3. Commit only `vrm-sealed-secrets.yaml` files.

## Container context sync (important)

This project maintains both root service folders and mirrored `container/*` build contexts.
Before opening a PR that changes `frontend`, `gateway`, or `services/*`, run:

```bash
./scripts/sync-container-context.sh
```

## Legacy assets

The repository also contains a `k8s/` directory with alternative manifests and experiments. Current CI/CD delivery is based on the `app/` Kustomize overlays.

## License

This project is licensed under the terms in `LICENSE`.
