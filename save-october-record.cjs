const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

const app = initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore(app, 'ai-studio-592c0d51-dd54-4c05-bab8-0fb1579ee05e');
const UID = 'k5l8HcXiYyRdc5vkUdvTnw0DsV52';

const octoberRecord = {
  uid: UID,
  referenceMonth: '2026-10',
  closedAt: FieldValue.serverTimestamp(),
  totalYield: 730.70,
  notes: 'Fechamento de Outubro. Rendimentos consolidados antes da varredura e transferências para o 99Pay.',
  assetsSnapshot: [
    { name: 'Mercado Pago · Saldo', yield: 79.70 },
    { name: 'Mercado Pago • Cofrinho', yield: 104.14 },
    { name: 'Mercado Pago · Saldo - V', yield: 43.45 },
    { name: 'Mercado Pago · Cofrinho - V', yield: 51.61 },
    { name: 'Mercado Pago · Saldo - O', yield: 47.52 },
    { name: 'Mercado Pago · Cofrinho - O', yield: 51.49 },
    { name: '99Pay', yield: 97.54 },
    { name: '99Pay - V', yield: 87.49 },
    { name: '99Pay - O', yield: 89.23 },
    { name: '99Pay - P', yield: 71.82 },
    { name: 'Cofrinho 99', yield: 2.23 },
    { name: 'Cofrinho 99 - V', yield: 2.24 },
    { name: 'Cofrinho 99 - O', yield: 2.24 },
    { name: 'Cofrinho 99 - P', yield: 2.23 }
  ]
};

async function saveRecord() {
  console.log('📄 Salvando o fechamento de Outubro no Firestore...\n');
  
  try {
    const newRecordRef = db.collection('statements').doc();
    await newRecordRef.set({
      ...octoberRecord,
      id: newRecordRef.id
    });
    
    console.log(`✅ Histórico salvo com sucesso! ID: ${newRecordRef.id}`);
    console.log(`📊 Mês: Outubro/2026 | Rendimento Total: R$ 730,70`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao salvar histórico:', error.message);
    process.exit(1);
  }
}

saveRecord();
