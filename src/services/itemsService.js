const { db } = require('../db/firebase');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * خدمة إدارة الأصناف والمخزون
 */
const itemsService = {
  /**
   * جلب جميع الأصناف (المحاصيل)
   */
  async getAllItems(type = null) {
    let query = db.collection('items');
    if (type) {
      query = query.where('item_type', '==', type);
    }
    const snapshot = await query.get();
    const items = [];
    snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
    return items.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  },

  /**
   * جلب صنف محدد
   */
  async getItemById(id) {
    const doc = await db.collection('items').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  },

  /**
   * إضافة صنف محصول جديد للمزرعة
   */
  async addItem(data) {
    const { name, category, unit, default_sell_price, code } = data;
    if (!name || !name.trim()) {
      throw new Error('يرجى إدخال اسم الصنف أو المحصول');
    }

    const itemRef = db.collection('items').doc();
    const newItem = {
      id: itemRef.id,
      name: name.trim(),
      category: category ? category.trim() : 'محاصيل زراعية',
      unit: unit ? unit.trim() : 'فلين',
      current_stock: 0,
      default_sell_price: Number(default_sell_price) || 0,
      item_type: 'crop',
      code: code ? code.trim() : `CRP-${Date.now().toString().slice(-4)}`,
      created_at: FieldValue.serverTimestamp()
    };

    await itemRef.set(newItem);
    return newItem;
  },

  /**
   * جلب جميع تصنيفات المصاريف
   */
  async getExpenseCategories() {
    const snapshot = await db.collection('expense_categories').get();
    const categories = [];
    snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
    return categories.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  },

  /**
   * إضافة تصنيف مصروف جديد
   */
  async addExpenseCategory(data) {
    const { name, type, notes, code } = data;
    if (!name || !name.trim()) {
      throw new Error('يرجى إدخال اسم تصنيف المصروف');
    }

    const catRef = db.collection('expense_categories').doc();
    const newCategory = {
      id: catRef.id,
      name: name.trim(),
      type: type ? type.trim() : 'مصاريف تشغيلية',
      notes: notes ? notes.trim() : '',
      code: code ? code.trim() : `EXP-${Date.now().toString().slice(-4)}`,
      created_at: FieldValue.serverTimestamp()
    };

    await catRef.set(newCategory);
    return newCategory;
  }
};

module.exports = itemsService;
