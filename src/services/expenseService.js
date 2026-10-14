const { db } = require('../db/firebase');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * خدمة إدارة مصاريف الإنتاج والمصاريف التشغيلية للمزرعة
 */
const expenseService = {
  /**
   * تسجيل سند صرف / مصروف جديد مع تحديث حسابات الشهر والمحصول تلقائياً
   */
  async recordExpense(data) {
    const {
      categoryId,
      categoryName,
      title,
      amount,
      expenseDate = new Date().toISOString().split('T')[0],
      cropId = null, // اختياري: إذا كان المصروف خاص بمحصول معين
      cropName = null,
      paymentMethod = 'cash',
      recipient = '',
      invoiceRef = '',
      notes = ''
    } = data;

    const numAmount = Number(amount);
    if (!title && !categoryName) throw new Error('يرجى كتابة بيان أو اختيار تصنيف المصروف');
    if (!numAmount || numAmount <= 0) throw new Error('يجب أن يكون مبلغ المصروف أكبر من الصفر');

    const accountingPeriod = expenseDate.substring(0, 7); // Format: 'YYYY-MM'

    // حفظ المصروف وتحديث التقرير الشهري التراكمي في Transaction
    const result = await db.runTransaction(async (transaction) => {
      const expenseRef = db.collection('expenses').doc();

      const expenseDoc = {
        id: expenseRef.id,
        category_id: categoryId || 'general',
        category_name: categoryName || title,
        title: title || categoryName,
        amount: numAmount,
        expense_date: expenseDate,
        accounting_period: accountingPeriod,
        crop_id: cropId || null,
        crop_name: cropName || (cropId ? 'محصول مخصص' : 'مصروف عام للمزرعة'),
        payment_method: paymentMethod, // cash, bank, credit
        recipient: recipient || '',
        invoice_ref: invoiceRef || '',
        notes: notes || '',
        created_at: FieldValue.serverTimestamp()
      };

      transaction.set(expenseRef, expenseDoc);

      // تحديث الملخص الشهري (Monthly Report Document)
      const monthlySummaryRef = db.collection('monthly_reports').doc(accountingPeriod);
      const updateData = {
        period: accountingPeriod,
        total_monthly_expenses: FieldValue.increment(numAmount),
        [`categories.${categoryId || 'other'}.name`]: categoryName || title,
        [`categories.${categoryId || 'other'}.total`]: FieldValue.increment(numAmount),
        updated_at: FieldValue.serverTimestamp()
      };

      // إذا كان المصروف مخصصاً لمحصول معين (مثل كراتين خيار أو سماد طماطم)، يضاف لحساب المحصول
      if (cropId) {
        updateData[`crops.${cropId}.name`] = cropName;
        updateData[`crops.${cropId}.total_expenses`] = FieldValue.increment(numAmount);
      } else {
        // مصروف عام للمزرعة (ديزل، كهرباء، وايت ماء، أكل كلاب...)
        updateData['total_general_overheads'] = FieldValue.increment(numAmount);
      }

      transaction.set(monthlySummaryRef, updateData, { merge: true });

      return {
        expenseId: expenseRef.id,
        title: expenseDoc.title,
        amount: numAmount,
        period: accountingPeriod,
        cropName: expenseDoc.crop_name
      };
    });

    return result;
  },

  /**
   * جلب المصاريف مع فلاتر (بحسب الشهر أو المحصول أو التصنيف)
   */
  async getExpenses(filters = {}) {
    let query = db.collection('expenses');

    if (filters.period) {
      query = query.where('accounting_period', '==', filters.period);
    }
    if (filters.cropId) {
      query = query.where('crop_id', '==', filters.cropId);
    }
    if (filters.categoryId) {
      query = query.where('category_id', '==', filters.categoryId);
    }

    const snapshot = await query.get();
    const expenses = [];
    snapshot.forEach(doc => expenses.push(doc.data()));

    // ترتيب السجلات من الأحدث للأقدم
    return expenses.sort((a, b) => (b.expense_date > a.expense_date ? 1 : -1));
  },

  /**
   * حذف مصروف وتحديث المجاميع الشهرية
   */
  async deleteExpense(expenseId) {
    return await db.runTransaction(async (transaction) => {
      const expenseRef = db.collection('expenses').doc(expenseId);
      const expenseDoc = await transaction.get(expenseRef);

      if (!expenseDoc.exists) {
        throw new Error('سند المصروف غير موجود');
      }

      const expData = expenseDoc.data();
      const numAmount = Number(expData.amount || 0);

      // عكس أثر المصروف من التقرير الشهري
      const monthlySummaryRef = db.collection('monthly_reports').doc(expData.accounting_period);
      const updateData = {
        total_monthly_expenses: FieldValue.increment(-numAmount),
        updated_at: FieldValue.serverTimestamp()
      };

      if (expData.crop_id) {
        updateData[`crops.${expData.crop_id}.total_expenses`] = FieldValue.increment(-numAmount);
      } else {
        updateData['total_general_overheads'] = FieldValue.increment(-numAmount);
      }

      transaction.set(monthlySummaryRef, updateData, { merge: true });
      transaction.delete(expenseRef);

      return { success: true, message: 'تم حذف المصروف بنجاح' };
    });
  }
};

module.exports = expenseService;
