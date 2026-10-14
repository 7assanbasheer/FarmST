const { db } = require('../db/firebase');

/**
 * خدمة إدارة الأصناف والمخزون
 */
const itemsService = {
  /**
   * جلب جميع الأصناف (المحاصيل الـ 30)
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
   * جلب جميع تصنيفات المصاريف الـ 22
   */
  async getExpenseCategories() {
    const snapshot = await db.collection('expense_categories').get();
    const categories = [];
    snapshot.forEach(doc => categories.push({ id: doc.id, ...doc.data() }));
    return categories.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }
};

module.exports = itemsService;
