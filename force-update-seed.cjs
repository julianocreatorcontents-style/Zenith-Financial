const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app, 'ai-studio-592c0d51-dd54-4c05-bab8-0fb1579ee05e');
const todayISO = new Date().toISOString();
const UID = 'k5l8HcXiYyRdc5vkUdvTnw0DsV52';

const seedUpdates = [
  { name: 'Mercado Pago · Saldo', balance: 0.00, daily: 0.00, weekend: null },
  { name: 'Mercado Pago · Saldo - V', balance: 0.00, daily: 0.00, weekend: null },
  { name: 'Mercado Pago · Saldo - O', balance: 0.00, daily: 0.00, weekend: null },
  { name: 'Mercado Pago • Cofrinho', balance: 10000.00, daily: 4.83, weekend: null },
  { name: 'Mercado Pago · Cofrinho - V', balance: 5000.00, daily: 2.31, weekend: null },
  { name: 'Mercado Pago · Cofrinho - O', balance: 5000.00, daily: 2.31, weekend: null },
  { name: '99Pay', balance: 9038.58, daily: 2.42, weekend: 3.52 },
  { name: '99Pay - V', balance: 5182.55, daily: 2.37, weekend: 2.40 },
  { name: '99Pay - O', balance: 6758.09, daily: 2.37, weekend: 2.80 },
  { name: '99Pay - P', balance: 5073.35, daily: 2.37, weekend: 2.34 },
  { name: 'Cofrinho 99', balance: 5002.23, daily: 2.24, weekend: 2.23 },
  { name: 'Cofrinho 99 - V', balance: 5002.23, daily: 2.24, weekend: 2.23 },
  { name: 'Cofrinho 99 - O', balance: 5002.23, daily: 2.24, weekend: 2.23 }
];

async function forceSeed() {
  console.log('🚀 Forçando atualização do banco com o Extrato Oficial (31/10)...\n');
  
  const assetsRef = db.collection('assets');
  const snapshot = await assetsRef.where('uid', '==', UID).get();
  const dbAssets = snapshot.docs;

  let totalGeral = 0;

  for (const item of seedUpdates) {
    const existingDoc = dbAssets.find(d => (d.data().name || '').toLowerCase() === item.name.toLowerCase());

    if (existingDoc) {
      await existingDoc.ref.update({
        manualBalance: item.balance,
        manualBalanceDate: todayISO,
        manualDailyYield: item.daily,
        manualWeekendYield: item.weekend,
        value: item.balance,
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log(`✅ ${item.name.padEnd(28)} | Saldo: R$ ${item.balance.toFixed(2).padStart(9)} | Útil: R$ ${item.daily.toFixed(2)} | FDS: ${item.weekend ? 'R$ ' + item.weekend.toFixed(2) : '---'}`);
    } else {
      console.log(`⚠️ Ativo não encontrado: ${item.name}`);
    }
    totalGeral += item.balance;
  }
  
  console.log(`\n🎉 Sincronização concluída!`);
  console.log(`📊 NOVO PATRIMÔNIO TOTAL: R$ ${totalGeral.toFixed(2)}`);
  process.exit(0);
}

forceSeed();
