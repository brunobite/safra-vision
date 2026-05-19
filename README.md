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

## Observação sobre ambiente com proxy

Se `npm install` retornar `E403 Forbidden` para pacotes públicos (por exemplo em `https://registry.npmjs.org/`), valide se há proxy corporativo/CI interceptando chamadas HTTP(S). Nesse cenário, o problema pode ser de política/rede do ambiente e não do repositório.
