require('dotenv').config();
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json');

let app = null;
let rawDb = null;

try {
  // 1. محاولة القراءة من متغير البيئة FIREBASE_SERVICE_ACCOUNT (المفضل في Vercel)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    app = getApps().length ? getApps()[0] : initializeApp({
      credential: cert(serviceAccount)
    });
    rawDb = getFirestore();
  }
  // 2. محاولة القراءة من Base64 (لتفادي أي مشاكل في أسطر المفتاح على Vercel)
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(decoded);
    app = getApps().length ? getApps()[0] : initializeApp({
      credential: cert(serviceAccount)
    });
    rawDb = getFirestore();
  }
  // 3. محاولة القراءة من ملف serviceAccountKey.json المحلي
  else if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    app = getApps().length ? getApps()[0] : initializeApp({
      credential: cert(serviceAccount)
    });
    rawDb = getFirestore();
  }
  // 4. محاولة القراءة من متغيرات البيئة المنفصلة
  else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    app = getApps().length ? getApps()[0] : initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
    rawDb = getFirestore();
  }
} catch (error) {
  console.error('تحذير أثناء تهيئة Firebase:', error.message);
}

// استخدام Proxy لحماية العمليات وتوضيح الخطأ عند غياب المفتاح
const db = new Proxy({}, {
  get(target, prop) {
    if (!rawDb) {
      throw new Error('❌ قاعدة بيانات Firebase غير مهيأة! يرجى إضافة متغير البيئة FIREBASE_SERVICE_ACCOUNT في إعدادات Vercel.');
    }
    const val = rawDb[prop];
    return typeof val === 'function' ? val.bind(rawDb) : val;
  }
});

/**
 * فحص الاتصال بقاعدة بيانات Cloud Firestore
 */
async function testFirebaseConnection() {
  if (!rawDb) {
    console.error('❌ لم يتم العثور على ملف serviceAccountKey.json أو متغيرات بيئة Firebase في Vercel.');
    return false;
  }

  try {
    await rawDb.collection('_health_check').limit(1).get();
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
  rawDb,
  testFirebaseConnection,
};
