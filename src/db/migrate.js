const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./connection');

/**
 * تنفيذ ملف الـ Schema وإنشاء الجداول في PostgreSQL
 */
async function runMigration() {
  console.log('🚀 بدء عملية تطبيق الـ Schema على قاعدة بيانات PostgreSQL...\n');

  // 1. اختبار الاتصال أولاً
  const isConnected = await testConnection();
  if (!isConnected) {
    console.error('\n❌ توقفت العملية: تأكد من تشغيل خادم PostgreSQL وصحة إعدادات ملف .env');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    console.log('\n⏳ جاري قراءة وتنفيذ أوامر SQL لإنشاء الجداول والفهارس...');
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');

    // 2. التحقق من الجداول المنشأة
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('\n✨ تم بنجاح إنشاء مخطط قاعدة البيانات (Schema) بالكامل!');
    console.log(`📋 إجمالي الجداول المنشأة في النظام: ${tablesRes.rowCount} جدولاً:\n`);
    tablesRes.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.table_name}`);
    });
    console.log('\n🎉 اكتملت المهمة رقم 1 بنجاح تام.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ حدث خطأ أثناء تطبيق الـ Schema:');
    console.error(err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
