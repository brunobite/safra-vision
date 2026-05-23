#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const CONFIRM = 'CONFIRMO_ZERAR_SAFRA_26_27';
const mustConfirm = process.env.ALLOW_HARD_RESET === CONFIRM;
const dryRun = process.argv.includes('--dry-run') || !mustConfirm;
const apply = process.argv.includes('--apply');

const inputArg = process.argv.find((a) => a.startsWith('--input='));
const inputFile = inputArg ? inputArg.split('=')[1] : 'backup-current.json';

const source = path.resolve(process.cwd(), inputFile);
if (!fs.existsSync(source)) {
  console.error(`Arquivo não encontrado: ${source}`);
  process.exit(1);
}

const operationalStores = [
  'clientes','lancamentos','negocios','produtos','eventos','prioridadesP1','orcamentos','orcamentoItens','proximasAcoes','importLogs'
];

const raw = fs.readFileSync(source, 'utf-8');
const payload = JSON.parse(raw);

const backupDir = path.resolve(process.cwd(), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `backup-before-hard-reset-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2));

const report = { removed: {}, preserved: [], dryRun, backupPath };
for (const k of Object.keys(payload)) {
  if (operationalStores.includes(k) && Array.isArray(payload[k])) {
    report.removed[k] = payload[k].length;
    if (!dryRun) payload[k] = [];
  } else {
    report.preserved.push(k);
  }
}

const outFile = path.resolve(process.cwd(), `hard-reset-output-${stamp}.json`);
if (!dryRun && apply) {
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
}

console.log('=== HARD RESET OPERACIONAL ===');
console.log(`Confirmação válida: ${mustConfirm ? 'SIM' : 'NÃO'}`);
console.log(`Dry run: ${dryRun ? 'SIM' : 'NÃO'}`);
console.log(`Backup: ${backupPath}`);
console.log('Totais removidos por entidade:');
Object.entries(report.removed).forEach(([k, v]) => console.log(` - ${k}: ${v}`));
console.log(`Entidades preservadas: ${report.preserved.join(', ')}`);
if (!dryRun && apply) console.log(`Arquivo limpo gerado: ${outFile}`);
if (!mustConfirm) console.log(`Nada foi apagado. Defina ALLOW_HARD_RESET=${CONFIRM} e use --apply para execução real.`);
