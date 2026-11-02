const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app, 'ai-studio-592c0d51-dd54-4c05-bab8-0fb1579ee05e');
const todayISO = new Date().toISOString();
const UID = 'k5l8HcXiYyRdc5vkUdvTnw0DsV52';

const exactBalances = [
  { name: 'Mercado Pago · Saldo', balance: 1057.98 },
  { name: 'Mercado Pago · Saldo - V', balance: 0.00 },
  { name: 'Mercado Pago · Saldo - O', balance: 0.00 },
  { name: 'Mercado Pago • Cofrinho', balance: 10000.00 },
  { name: 'Mercado Pago · Cofrinho - V', balance: 5000.00 },
  { name: 'Mercado Pago · Cofrinho - O', balance: 5000.00 },
  { name: '99Pay', balance: 5000.00 },
  { name: '99Pay - V', balance: 5000.00 },
  { name: '99Pay - O', balance: 5000.00 },
  { name: '99Pay - P', balance: 5000.00 },
  { name: 'Cofrinho 99', balance: 5000.00 },
  { name: 'Cofrinho 99 - V', balance: 5000.00 },
  { name: 'Cofrinho 99 - O', balance: 5000.00 },
  { name: 'Cofrinho 99 - P', balance: 5000.00 }
];

async function forceExactBalances() {
  console.log('🎯 Sobrescrevendo saldos com os valores EXATOS do Extrato (31/10)...\n');
  
  const assetsRef = db.collection('assets');
  const snapshot = await assetsRef.where('uid', '==', UID).get();
  const dbAssets = snapshot.docs;

  let totalGeral = 0;

  for (const item of exactBalances) {
    const existingDoc = dbAssets.find(d => (d.data().name || '').toLowerCase() === item.name.toLowerCase());

    if (existingDoc) {
      await existingDoc.ref.update({
        manualBalance: item.balance,
        manualBalanceDate: todayISO,
        value: item.balance,
        manualDailyYield: FieldValue.delete(),
        manualWeekendYield: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log(`✅ ${item.name.padEnd(28)} | Saldo: R$ ${item.balance.toFixed(2).padStart(9)}`);
    } else {
      console.log(`⚠️ Ativo não encontrado: ${item.name}`);
    }
    totalGeral += item.balance;
  }
  
  console.log(`\n🎉 Sincronização concluída!`);
  console.log(`📊 NOVO PATRIMÔNIO TOTAL REAL: R$ ${totalGeral.toFixed(2)}`);
  process.exit(0);
}

forceExactBalances();
