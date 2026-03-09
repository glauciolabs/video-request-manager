# video-request-manager

Estrutura inicial (boilerplate) de um sistema de requisições de vídeo com frontend + microserviços + Kubernetes, preparada para build/push de containers e deploy com ArgoCD no padrão do `../htmly-app` + `../core-pipeline`.

## Stack escolhida
- Frontend: Next.js (React)
- Backend: Node.js + Express em microserviços
- Banco padrão: PostgreSQL (com opção MongoDB)
- Segurança: JWT (usuário) + token de serviço interno (`x-service-token`)
- Kubernetes/GitOps: Kustomize + ArgoCD

## Estrutura de pastas
```text
/frontend
/admin-frontend
/services/order-service
/services/user-service
/services/notification-service
/services/sla-service
/services/report-service
/gateway
/container
/app/base
/app/develop
/app/production
/argocd
/.github/workflows
/k8s
/database
/scripts
/docs
```

## Funcionalidades já no scaffold
- Frontend cliente (container próprio): formulário corporativo de solicitação
- Frontend admin (container separado): dashboard, pedidos e relatórios
- Notificação: Telegram (admin) + e-mail SMTP (cliente)
- SLA: política por prioridade e avaliação de prazos
- Relatórios: métricas simples por status e prioridade
- i18n no frontend: `🇧🇷 PT-BR` e `🇺🇸 EN-US`
- MSAL/Entra ID: ponto de integração preparado, com fallback para login local

## Como rodar local (base)
1. Instale dependências:
   ```bash
   npm install
   ```
2. Copie variáveis:
   ```bash
   cp .env.example .env
   ```
3. Suba o PostgreSQL local:
   ```bash
   docker compose up -d postgres
   ```
4. Execute os apps (cada um em um terminal):
   ```bash
   npm run dev:gateway
   npm run dev:user
   npm run dev:order
   npm run dev:notification
   npm run dev:sla
   npm run dev:report
   npm run dev:frontend
   ```

## CI/CD e ArgoCD (padrão htmly/core-pipeline)
- Workflows:
  - `.github/workflows/develop.yml` (qualquer branch exceto `master`)
  - `.github/workflows/master.yml` (`master` para produção)
- Reusable pipeline: `glauciolabs/core-pipeline/.github/workflows/core-pipeline.yml@add2`
- Build/push por imagem: `container/*/Dockerfile` + `container/*/info.yaml`
- Deploy Kustomize:
  - `app/develop`
  - `app/production`
- Deploy está fixado em `kustomize` nos workflows (`master => production`, demais branches => `develop`).
- Script de sincronização do contexto de build:
  - `scripts/sync-container-context.sh`

Consulte [docs/cicd.md](docs/cicd.md) para variáveis e segredos.

Antes de abrir PR com mudanças em `/frontend`, `/gateway` ou `/services`, rode:
```bash
./scripts/sync-container-context.sh
```

Para build/test local das imagens:
```bash
cp .env.example .env
docker compose -f container/compose.yaml build
docker compose -f container/compose.yaml up -d
```

Acessos locais:
- Cliente: `http://localhost:3000`
- Admin: `http://localhost:3006`

## Registry (GHCR)
Este projeto está configurado para publicar **somente no GHCR**.

- Configure estes secrets no repositório:
  - `REGISTRY=ghcr.io`
  - `REGISTRY_USERNAME` (opcional; se vazio usa `github.actor`)
  - `REGISTRY_PASSWORD` (opcional; se vazio usa `GITHUB_TOKEN`)
- `container/*/info.yaml` já está apontando para `ghcr.io/glauciolabs/...`.

## Kubernetes local (alternativo)
- Manifestos em `k8s/` com `kustomization.yaml`.
- Banco principal: CloudNativePG (`k8s/db/cloudnative-pg-cluster.yaml`).
- Opção alternativa: MongoDB (`k8s/db/mongodb-optional.yaml`).
- Backup automático: `k8s/cronjob/db-backup-cronjob.yaml` envia dumps para repositório Git.

## Observação sobre branch de produção
No `core-pipeline` atual, o script de `extract_info` considera `master` como produção.
Se você quiser usar branch `production`, será necessário ajustar `../core-pipeline/scripts/extract_info.sh`.

## Kustomize (pipeline)
- Caminhos usados pelo pipeline:
  - `app/develop`
  - `app/production`
- `HTTPProxy` configurado com:
  - App cliente: `vrm*.example.com` + rota `/api` com rewrite para gateway
  - Admin: host dedicado `admin.vrm*.example.com`
- Antes do deploy, revise e substitua placeholders em `app/base/secret.yaml` (JWT, PostgreSQL, Telegram e SMTP).
