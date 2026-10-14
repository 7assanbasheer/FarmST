require('dotenv').config();
const { Pool } = require('pg');

// إعداد خزان الاتصالات (Connection Pool)
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5432', 10),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'farm_db',
    };

const pool = new Pool(poolConfig);

// مراقبة الاتصال
pool.on('error', (err) => {
  console.error('خطأ غير متوقع في خزان اتصالات PostgreSQL:', err.message);
});

/**
 * تنفيذ استعلام SQL مباشر
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return res;
}

/**
 * فحص الاتصال بقاعدة البيانات
 */
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() as current_time, current_database() as db_name, version() as pg_version');
    console.log('✅ تم الاتصال بنجاح بقاعدة بيانات PostgreSQL!');
    console.log(`   - اسم القاعدة: ${res.rows[0].db_name}`);
    console.log(`   - التوقيت الحالي: ${res.rows[0].current_time}`);
    return true;
  } catch (error) {
    console.error('❌ فشل الاتصال بقاعدة البيانات:');
    console.error(`   السبب: ${error.message}`);
    return false;
  }
}

module.exports = {
  pool,
  query,
  testConnection,
};
