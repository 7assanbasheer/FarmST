const { db, testFirebaseConnection } = require('./firebase');

// قائمة أصناف الإنتاج الـ 30
const productionCrops = [
  { name: 'رطب', category: 'تمور ونخيل', default_unit: 'كرتون' },
  { name: 'ليمون', category: 'حمضيات وفواكه', default_unit: 'صندوق' },
  { name: 'فليفله أخضر محمي', category: 'خضار بيوت محمية', default_unit: 'كرتون' },
  { name: 'فليفله اخضر خارجي', category: 'خضار مكشوف', default_unit: 'صندوق' },
  { name: 'فليفله أصفر', category: 'خضار بيوت محمية', default_unit: 'كرتون' },
  { name: 'فليفله أحمر', category: 'خضار بيوت محمية', default_unit: 'كرتون' },
  { name: 'فلفل حار هندي', category: 'خضار', default_unit: 'كرتون' },
  { name: 'باميا عربي', category: 'خضار', default_unit: 'صندوق' },
  { name: 'باميا هندي', category: 'خضار', default_unit: 'صندوق' },
  { name: 'تين', category: 'فواكه', default_unit: 'طبق' },
  { name: 'شمام', category: 'فواكه ومحاصيل', default_unit: 'حبة' },
  { name: 'خيار', category: 'خضار بيوت محمية', default_unit: 'كرتون' },
  { name: 'كوسا', category: 'خضار', default_unit: 'صندوق' },
  { name: 'ذرة', category: 'محاصيل حقلية', default_unit: 'كيس' },
  { name: 'طماطم خليجي محمي', category: 'خضار بيوت محمية', default_unit: 'صندوق' },
  { name: 'طماطم خارجي', category: 'خضار مكشوف', default_unit: 'صندوق' },
  { name: 'طماطم شوكية', category: 'خضار', default_unit: 'صندوق' },
  { name: 'طماطم شيري', category: 'خضار بيوت محمية', default_unit: 'كرتون' },
  { name: 'قرع', category: 'خضار', default_unit: 'حبة' },
  { name: 'أسود محمي', category: 'خضار بيوت محمية', default_unit: 'صندوق' },
  { name: 'أسود خارجي', category: 'خضار مكشوف', default_unit: 'صندوق' },
  { name: 'زهرة', category: 'خضار', default_unit: 'صندوق' },
  { name: 'بروكلي', category: 'خضار', default_unit: 'كرتون' },
  { name: 'بوبر', category: 'محاصيل قرعية', default_unit: 'حبة' },
  { name: 'جح', category: 'فواكه ومحاصيل', default_unit: 'حبة' },
  { name: 'لوز', category: 'مكسرات وفواكه', default_unit: 'كجم' },
  { name: 'سمن', category: 'منتجات تحويلية', default_unit: 'علبة' },
  { name: 'بيض', category: 'إنتاج داجني', default_unit: 'طبق' },
  { name: 'دجاج', category: 'إنتاج داجني', default_unit: 'رأس' },
  { name: 'ديوك', category: 'إنتاج داجني', default_unit: 'رأس' }
];

// قائمة أصناف المصروفات الـ 22
const expenseCategories = [
  { name: 'مبيدات', type: 'direct_crop', notes: 'علاج آفات وحشرات' },
  { name: 'السماد', type: 'direct_crop', notes: 'أسمدة كيماوية ومركبة' },
  { name: 'خيوط ربط', type: 'consumable', notes: 'مستلزمات تسليق وربط نباتات' },
  { name: 'كراتين خيار', type: 'packaging', notes: 'تعبئة وتغليف' },
  { name: 'فلين كبير', type: 'packaging', notes: 'صناديق فلين كبيرة' },
  { name: 'فلين وسط', type: 'packaging', notes: 'صناديق فلين وسط' },
  { name: 'فلين صغير', type: 'packaging', notes: 'صناديق فلين صغيرة' },
  { name: 'كراتين موز', type: 'packaging', notes: 'كراتين خضار وفواكه' },
  { name: 'بونتيج صويل', type: 'direct_crop', notes: 'تربة زراعية وبيتموس' },
  { name: 'GR', type: 'irrigation_equipment', notes: 'شبكات تنقيط / مواد زراعية' },
  { name: 'اقرل', type: 'equipment', notes: 'شاش زراعي وتغطية محاصيل' },
  { name: 'أكل كلاب', type: 'general_farm', notes: 'حراسة المزرعة' },
  { name: 'أعلاف', type: 'livestock', notes: 'تغذية دواجن ومواشي' },
  { name: 'وايت ماء', type: 'general_farm', notes: 'مياه ري واستخدام' },
  { name: 'ديزل للمزرعة', type: 'general_farm', notes: 'وقود مضخات ومولدات' },
  { name: 'بنزين للمزرعة', type: 'general_farm', notes: 'وقود آليات وسيارات' },
  { name: 'فحال', type: 'direct_crop', notes: 'لقاح وتلقيح نخيل' },
  { name: 'عامل خارجي', type: 'labor', notes: 'يوميات عمالة حصاد إضافية' },
  { name: 'سماد دواجن', type: 'direct_crop', notes: 'سماد عضوي دواجن' },
  { name: 'سماد بقر', type: 'direct_crop', notes: 'سماد عضوي أبقار' },
  { name: 'كنترول', type: 'equipment', notes: 'أجهزة تحكم بيوت محمية ومكافحة' },
  { name: 'سيفتي شوز', type: 'safety', notes: 'أحذية سلامة ومهمات عمال' },
  { name: 'أخرى (مصروفات متنوعة)', type: 'other', notes: 'أي مصاريف أو مشتريات أخرى غير مدرجة' }
];

async function seedFirebase() {
  console.log('🚀 بدء تغذية بيانات المزرعة في Firebase Firestore...\n');

  const isConnected = await testFirebaseConnection();
  if (!isConnected) {
    console.error('\n❌ توقف: يرجى وضع ملف serviceAccountKey.json أولاً للمتابعة.');
    process.exit(1);
  }

  const batch = db.batch();

  // 1. زراعة أصناف الإنتاج الـ 30 في مجموعة items
  console.log('📦 زراعة أصناف الإنتاج الـ 30...');
  productionCrops.forEach((crop, idx) => {
    const docRef = db.collection('items').doc(`crop_${idx + 1}`);
    batch.set(docRef, {
      code: `CRP-${String(idx + 1).padStart(3, '0')}`,
      name: crop.name,
      category: crop.category,
      item_type: 'CROP_PRODUCT',
      unit: crop.default_unit,
      current_stock: 0,
      default_sell_price: 0,
      created_at: new Date()
    });
  });

  // 2. زراعة أصناف المصروفات الـ 22 في مجموعة expense_categories
  console.log('💰 زراعة أصناف المصروفات الـ 22...');
  expenseCategories.forEach((exp, idx) => {
    const docRef = db.collection('expense_categories').doc(`exp_${idx + 1}`);
    batch.set(docRef, {
      code: `EXP-${String(idx + 1).padStart(3, '0')}`,
      name: exp.name,
      type: exp.type,
      notes: exp.notes,
      created_at: new Date()
    });
  });

  // 3. إعداد وثيقة إعدادات المزرعة العامة
  console.log('⚙️ إعداد وثيقة بيانات المزرعة...');
  const settingsRef = db.collection('settings').doc('farm_profile');
  batch.set(settingsRef, {
    farm_name: 'مزرعة الخير النموذجية',
    owner_name: 'إدارة المزرعة',
    phone: '',
    currency: 'ريال',
    tax_rate: 0,
    created_at: new Date()
  });

  await batch.commit();

  console.log('\n✨ تم بنجاح حقن جميع أصناف الإنتاج الـ 30 وأصناف المصروفات الـ 22 في Firestore!');
  console.log('🎉 المزرعة جاهزة الآن للعمليات اليومية.');
}

if (require.main === module) {
  seedFirebase();
}

module.exports = { seedFirebase };
