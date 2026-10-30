const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const todayISO = new Date().toISOString(); // Data de hoje (30/10)

const updates = [
  { id: 'SKDuJpdSY6mISXJPBolW', name: 'Mercado Pago · Saldo', balance: 8786.70, daily: 3.71, weekend: null },
  { id: 'UO4GNXPGjnuXwft9Zxon', name: 'Mercado Pago • Cofrinho', balance: 10104.14, daily: 4.83, weekend: null },
  { id: '9ijo4qkchq6tfyifc9gl', name: '99Pay', balance: 5094.22, daily: 2.42, weekend: 4.95 },
  { id: 'qlPZyGtm5nC2ZtGVZ8sf', name: 'Mercado Pago · Saldo - V', balance: 5043.45, daily: 2.13, weekend: null },
  { id: 'Ag8aer9wjjEfknjy6DPB', name: 'Mercado Pago · Cofrinho - V', balance: 5051.61, daily: 2.31, weekend: null },
  { id: 'Z2SiUfHEMqF1wjYNuqiw', name: '99Pay - V', balance: 5085.09, daily: 2.37, weekend: 3.80 },
  { id: 'Rp5A8rq9LQsoUDabIl3L', name: 'Mercado Pago · Saldo - O', balance: 6077.52, daily: 2.56, weekend: null },
  { id: 'r24X9Wh2ryUzHo8yD2yT', name: 'Mercado Pago · Cofrinho - O', balance: 5051.49, daily: 2.31, weekend: null },
  { id: 'u6X1grls6jgjTwstazfB', name: '99Pay - O', balance: 5086.38, daily: 2.37, weekend: 4.10 },
  { id: 'zDqYsF8TCM0gmym3kot6', name: '99Pay - P', balance: 5071.01, daily: 2.37, weekend: null }
];

async function updateAssets() {
  console.log('🚀 Atualizando banco com os dados de 30/10...\n');
  
  for (const item of updates) {
    try {
      const assetRef = db.collection('assets').doc(item.id);
      
      await assetRef.update({
        manualBalance: item.balance,
        manualBalanceDate: todayISO,
        manualDailyYield: item.daily,
        manualWeekendYield: item.weekend,
        value: item.balance,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ ${item.name.padEnd(30)} | Saldo: R$ ${item.balance.toFixed(2).padStart(9)} | Rend: R$ ${item.daily.toFixed(2)}`);
    } catch (error) {
      console.error(`❌ Erro em ${item.name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Banco de dados atualizado com sucesso!');
  process.exit(0);
}

updateAssets();
