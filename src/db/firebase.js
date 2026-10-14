require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json');

let app = null;
let db = null;

try {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    app = initializeApp({
      credential: cert(serviceAccount)
    });
    db = getFirestore();
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
    db = getFirestore();
  }
} catch (error) {
  console.error('تحذير أثناء تهيئة Firebase:', error.message);
}

/**
 * فحص الاتصال بقاعدة بيانات Cloud Firestore
 */
async function testFirebaseConnection() {
  if (!db) {
    console.error('❌ لم يتم العثور على ملف serviceAccountKey.json أو متغيرات بيئة Firebase.');
    console.error('   يرجى وضع ملف serviceAccountKey.json في مجلد المشروع الرئيسي.');
    return false;
  }

  try {
    // محاولة قراءة خفيفة لفحص الاتصال
    await db.collection('_health_check').limit(1).get();
    console.log('✅ تم الاتصال بنجاح بقاعدة بيانات Firebase Cloud Firestore!');
    return true;
  } catch (err) {
    console.error('❌ فشل الاتصال بقاعدة بيانات Firebase:');
    console.error(`   السبب: ${err.message}`);
    return false;
  }
}

module.exports = {
  app,
  db,
  testFirebaseConnection,
};
