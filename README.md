# Safra 26/27 — Controle Operacional

## Padrão de package manager

Este projeto utiliza **npm** como package manager oficial.

- Lockfile oficial: `package-lock.json`
- Não utilizar `bun.lockb`

## Comandos de validação

```bash
npm ci
npm run build
npm run lint
npm run typecheck
```

## Auth (Sprint 17B hotfix)

- `VITE_ADMIN_EMAILS` aceita lista de e-mails (separados por vírgula) para bootstrap inicial no fluxo de cadastro.
- Mesmo com bootstrap no cliente, a proteção real de segurança está no banco (RLS/policies em `public.profiles`).
- Se não usar `VITE_ADMIN_EMAILS`, promova o primeiro admin manualmente no Supabase (definindo `role='admin'` e `status='active'`).

## Observação sobre ambiente com proxy

Se `npm install` retornar `E403 Forbidden` para pacotes públicos (por exemplo em `https://registry.npmjs.org/`), valide se há proxy corporativo/CI interceptando chamadas HTTP(S). Nesse cenário, o problema pode ser de política/rede do ambiente e não do repositório.

## Hard reset operacional (Safra 26/27)

- Dados de demonstração agora só são carregados quando `VITE_ENABLE_DEMO_DATA=true`.
- Produtos de demonstração só são carregados quando `VITE_ENABLE_DEMO_PRODUCTS=true`.
- Em produção/homologação, mantenha ambos como `false` (padrão).

### Script seguro de reset

```bash
node scripts/hard-reset-operational-data.js --dry-run --input=backup-current.json
ALLOW_HARD_RESET=CONFIRMO_ZERAR_SAFRA_26_27 node scripts/hard-reset-operational-data.js --apply --input=backup-current.json
```

O script:
1. Gera backup antes de qualquer alteração.
2. Exige confirmação via variável de ambiente.
3. Suporta dry-run.
4. Zera somente entidades operacionais.
5. Preserva usuários/config/auth/permissões (quando presentes no payload).
