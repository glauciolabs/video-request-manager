# Arquitetura inicial

## Fluxo principal
1. Frontend chama `api-gateway`.
2. Gateway aplica rate limit + sanitização + injeta `x-service-token`.
3. Microserviços validam token de serviço e, quando necessário, JWT do usuário.
4. Serviços trocam dados por API interna (neste scaffold ainda em memória).

## Domínios de serviço
- `user-service`: autenticação e perfis (`client/admin`)
- `order-service`: pedidos, prioridade, status e regra de edição
- `notification-service`: Telegram Bot API / placeholder para email
- `sla-service`: política de SLA por prioridade e detecção de atraso
- `report-service`: agregações e relatórios simples
- `gateway`: unificação de rotas e segurança de borda

## Observabilidade e segurança
- Logs estruturados em JSON com `pino`
- `helmet`, `cors`, validação com `zod` e sanitização básica de entrada
- Segredos sensíveis por `Secret` no Kubernetes

## Banco e backup
- PostgreSQL como padrão relacional
- CloudNativePG como operador no cluster
- `CronJob` para dump recorrente e push em repositório Git remoto
