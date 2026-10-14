const { db } = require('../db/firebase');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * خدمة تسجيل وإدارة الحصاد وحركة المخزون
 */
const harvestService = {
  /**
   * تسجيل دورة حصاد / إنتاج جديدة مع تحديث المخزون وحركة التوريد
   */
  async recordHarvest(data) {
    const {
      itemId,
      quantity,
      unit,
      harvestDate = new Date().toISOString().split('T')[0],
      fieldLocation = 'الحقل الرئيسي',
      qualityGrade = 'نخب أول',
      notes = ''
    } = data;

    const numQty = Number(quantity);
    if (!itemId) throw new Error('يرجى تحديد المحصول المراد تسجيل حصاده');
    if (!numQty || numQty <= 0) throw new Error('يجب أن تكون كمية الحصاد أكبر من الصفر');

    const accountingPeriod = harvestDate.substring(0, 7); // Format: 'YYYY-MM' (مثلاً: '2026-10')

    // استخدام Firestore Transaction لضمان سلامة المخزون وعدم حدوث تضارب
    const result = await db.runTransaction(async (transaction) => {
      const itemRef = db.collection('items').doc(itemId);
      const itemDoc = await transaction.get(itemRef);

      if (!itemDoc.exists) {
        throw new Error('المحصول المحدد غير موجود في قاعدة البيانات');
      }

      const itemData = itemDoc.data();
      const currentStock = Number(itemData.current_stock || 0);
      const newStock = currentStock + numQty;

      // 1. إنشاء مرجع سجل الحصاد
      const harvestRef = db.collection('harvest_logs').doc();
      const harvestData = {
        id: harvestRef.id,
        item_id: itemId,
        crop_name: itemData.name,
        category: itemData.category || 'عام',
        quantity: numQty,
        unit: unit || itemData.unit || 'وحدة',
        harvest_date: harvestDate,
        accounting_period: accountingPeriod,
        field_location: fieldLocation,
        quality_grade: qualityGrade,
        notes: notes,
        created_at: FieldValue.serverTimestamp()
      };
      transaction.set(harvestRef, harvestData);

      // 2. تحديث رصيد المخزون في وثيقة الصنف
      transaction.update(itemRef, {
        current_stock: newStock,
        last_harvest_date: harvestDate,
        updated_at: FieldValue.serverTimestamp()
      });

      // 3. توثيق حركة المخزون في سجل الحركات (Stock Movement Ledger)
      const stockMovementRef = db.collection('stock_movements').doc();
      transaction.set(stockMovementRef, {
        id: stockMovementRef.id,
        item_id: itemId,
        crop_name: itemData.name,
        movement_type: 'HARVEST_IN',
        quantity: numQty,
        stock_after: newStock,
        unit: unit || itemData.unit || 'وحدة',
        reference_type: 'harvest_logs',
        reference_id: harvestRef.id,
        date: harvestDate,
        accounting_period: accountingPeriod,
        created_at: FieldValue.serverTimestamp()
      });

      // 4. تحديث التقرير الشهري التراكمي (Monthly Summary) لحساب التكلفة الفورية
      const monthlySummaryRef = db.collection('monthly_reports').doc(accountingPeriod);
      transaction.set(monthlySummaryRef, {
        period: accountingPeriod,
        [`crops.${itemId}.name`]: itemData.name,
        [`crops.${itemId}.total_harvest_qty`]: FieldValue.increment(numQty),
        total_farm_harvest_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp()
      }, { merge: true });

      return {
        harvestId: harvestRef.id,
        cropName: itemData.name,
        addedQuantity: numQty,
        newStock: newStock,
        unit: unit || itemData.unit
      };
    });

    return result;
  },

  /**
   * جلب سجلات الحصاد مع إمكانية التصفية بحسب الشهر أو المحصول
   */
  async getHarvestLogs(filters = {}) {
    let query = db.collection('harvest_logs');

    if (filters.period) {
      query = query.where('accounting_period', '==', filters.period);
    }
    if (filters.itemId) {
      query = query.where('item_id', '==', filters.itemId);
    }

    const snapshot = await query.get();
    const logs = [];
    snapshot.forEach(doc => logs.push(doc.data()));

    // ترتيب السجلات من الأحدث للأقدم
    return logs.sort((a, b) => (b.harvest_date > a.harvest_date ? 1 : -1));
  },

  /**
   * حذف سجل حصاد مع استرجاع المخزون تلقائياً
   */
  async deleteHarvestLog(logId) {
    return await db.runTransaction(async (transaction) => {
      const harvestRef = db.collection('harvest_logs').doc(logId);
      const harvestDoc = await transaction.get(harvestRef);

      if (!harvestDoc.exists) {
        throw new Error('سجل الحصاد غير موجود');
      }

      const harvestData = harvestDoc.data();
      const itemRef = db.collection('items').doc(harvestData.item_id);
      const itemDoc = await transaction.get(itemRef);

      if (itemDoc.exists) {
        const itemData = itemDoc.data();
        const currentStock = Number(itemData.current_stock || 0);
        const adjustedStock = Math.max(0, currentStock - Number(harvestData.quantity));

        // استرجاع المخزون
        transaction.update(itemRef, {
          current_stock: adjustedStock,
          updated_at: FieldValue.serverTimestamp()
        });

        // قيد حركة تصحيحية في المخزون
        const movementRef = db.collection('stock_movements').doc();
        transaction.set(movementRef, {
          id: movementRef.id,
          item_id: harvestData.item_id,
          crop_name: harvestData.crop_name,
          movement_type: 'ADJUSTMENT',
          quantity: -Number(harvestData.quantity),
          stock_after: adjustedStock,
          notes: `إلغاء سجل الحصاد رقم ${logId}`,
          created_at: FieldValue.serverTimestamp()
        });
      }

      // حذف السجل
      transaction.delete(harvestRef);

      return { success: true, message: 'تم حذف سجل الحصاد وإعادة ضبط المخزون بنجاح' };
    });
  }
};

module.exports = harvestService;
