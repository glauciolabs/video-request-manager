# CI/CD + ArgoCD

## Workflows
- `develop.yml`: dispara em qualquer branch exceto `master`
- `master.yml`: dispara em `master` (produção no core-pipeline atual)

Ambos usam o reusable workflow:
- `glauciolabs/core-pipeline/.github/workflows/core-pipeline.yml@add2`

## Segredos necessários
- `ARGOCD_SERVER`
- `ARGOCD_TOKEN`
- `GITOPS_SSH_PRIVATE_KEY` (se repositório privado)
- `CLUSTER_DEVELOP`
- `CLUSTER_PRODUCTION`
- `TELEGRAM_BOT_TOKEN` (opcional para notificação do workflow)
- `TELEGRAM_CHAT_ID` (opcional para notificação do workflow)

### Para GHCR (obrigatório neste projeto)
- `REGISTRY=ghcr.io`
- `REGISTRY_USERNAME` (opcional; se vazio usa `github.actor`)
- `REGISTRY_PASSWORD` (opcional; se vazio usa `GITHUB_TOKEN`)

Para usar `GITHUB_TOKEN`, os workflows precisam de:
- `permissions: packages: write`

## Contrato de build de imagens
Cada imagem precisa de:
- `container/<service>/Dockerfile`
- `container/<service>/info.yaml`

Como o `core-pipeline` atual usa contexto fixo `container/`, mantenha o código sincronizado:
```bash
./scripts/sync-container-context.sh
```

Para build/test local de todos os containers:
```bash
docker compose -f container/compose.yaml build
docker compose -f container/compose.yaml up -d
docker compose -f container/compose.yaml ps
```

Exemplo (`info.yaml`):
```yaml
app:
  name: order-service
  version: v0.1.0
  container:
    registry: GitHubContainerRegistry
    repository: ghcr.io/<org>/video-request-manager-order-service
    tag: v0.1.0
    platform: linux/amd64,linux/arm64
```

## Contrato de deploy
- Kustomize:
  - `app/develop`
  - `app/production`
- `argocd_deployment_mode` está fixado como `kustomize` nos workflows deste projeto.

## Pré-checklist Kubernetes (antes do primeiro deploy)
1. Validar `app/base/secret.yaml` com valores reais para:
   - `JWT_SECRET`, `SERVICE_JWT_SECRET`
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_DEFAULT_CHAT_ID`
   - `SMTP_*` (host, credenciais e remetente)
2. Confirmar domínios/hosts:
   - Cliente/API: `vrm-*.example.com`
   - Admin: `admin.vrm-*.example.com`
3. Validar render do kustomize:
   ```bash
   kubectl kustomize app/develop >/tmp/kust-dev.yaml
   kubectl kustomize app/production >/tmp/kust-prod.yaml
   ```
4. Conferir que as imagens em `container/*/info.yaml` apontam para o registry correto (GHCR).
