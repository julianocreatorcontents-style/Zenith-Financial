#!/usr/bin/env node
/**
 * Sprint 4a — T6 / Etapa 0: auditoria de conteúdo legado em /transactions.
 *
 * POR QUE ESTE SCRIPT EXISTE
 * As regras endurecidas em `firestore.rules` (isValidTransactionPayload) passam a
 * exigir, em create E update de /transactions:
 *   uid, label (string não vazia), value (number > 0), type in ['in','out','yield'].
 *
 * Um único doc legado fora desse formato NÃO quebra só a edição dele: quebra o
 * recálculo de saldos (`recalculateBalances` faz batch.update em todos os docs do
 * usuário) e o restore da lixeira. Por isso a auditoria é GATE de deploy.
 *
 * COMO RODAR (precisa de credencial de produção — não roda no emulador)
 *   npm i -D firebase-admin   # não é dependência do app
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json \
 *     node scripts/auditTransactionsLegacy.mjs
 *
 * Saída: contagem por tipo de violação + lista de IDs (até 20 por categoria).
 * Exit code 1 se houver qualquer violação → bloqueia o deploy das regras.
 *
 * NÃO executado neste sprint: o ambiente não tem credencial de produção.
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_TYPES = ['in', 'out', 'yield'];
const SAMPLE_LIMIT = 20;
const PAGE_SIZE = 500;

const projectId =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'gen-lang-client-0213613781';

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const categories = {
  missingRequiredKey: [],
  typeInvalid: [],
  valueNotNumber: [],
  valueNotPositive: [],
  labelMissingOrEmpty: [],
};

function classify(id, data) {
  const keys = ['uid', 'label', 'value', 'type'];
  if (keys.some((key) => !(key in data))) categories.missingRequiredKey.push(id);
  if (!ALLOWED_TYPES.includes(data.type)) categories.typeInvalid.push(id);
  if (typeof data.value !== 'number' || Number.isNaN(data.value)) categories.valueNotNumber.push(id);
  else if (data.value <= 0) categories.valueNotPositive.push(id);
  if (typeof data.label !== 'string' || data.label.trim().length === 0) {
    categories.labelMissingOrEmpty.push(id);
  }
}

let lastDoc = null;
let scanned = 0;

for (;;) {
  let query = db
    .collection('transactions')
    .orderBy('__name__')
    .limit(PAGE_SIZE);
  if (lastDoc) query = query.startAfter(lastDoc);

  const snapshot = await query.get();
  if (snapshot.empty) break;

  for (const doc of snapshot.docs) {
    scanned += 1;
    classify(doc.id, doc.data());
  }

  lastDoc = snapshot.docs[snapshot.docs.length - 1];
  if (snapshot.size < PAGE_SIZE) break;
}

const totalViolations = new Set(Object.values(categories).flat()).size;

console.log(`\n[AUDIT] /transactions — ${scanned} doc(s) analisado(s) em ${projectId}\n`);
for (const [name, ids] of Object.entries(categories)) {
  console.log(`  ${name.padEnd(20)} ${String(ids.length).padStart(6)}  ${ids.slice(0, SAMPLE_LIMIT).join(', ')}`);
}
console.log(`\n[AUDIT] docs distintos com violação: ${totalViolations}`);

if (totalViolations > 0) {
  console.error(
    '\n[AUDIT] BLOQUEADO: existem docs legados. Aplicar isValidTransactionPayload\n' +
      'quebraria update/recalc/restore desses docs. Decidir entre:\n' +
      '  (A) migrar os docs antes do deploy;\n' +
      '  (C) deferir T3.3 e planejar a migração.\n'
  );
  process.exit(1);
}

console.log('[AUDIT] OK: nenhum doc legado. Deploy das regras liberado.\n');
