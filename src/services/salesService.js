const { db } = require('../db/firebase');
const { FieldValue } = require('firebase-admin/firestore');

/**
 * خدمة إدارة المبيعات وفواتير البيع مع خصم المخزون التلقائي
 */
const salesService = {
  /**
   * إصدار فاتورة بيع جديدة مع التحقق من توفر المخزون وخصمه فورياً
   */
  async createSalesInvoice(data) {
    const {
      invoiceDate = new Date().toISOString().split('T')[0],
      customerName = 'عميل نقدي',
      customerPhone = '',
      paymentMethod = 'cash',
      paidAmount,
      discount = 0,
      notes = '',
      items = []
    } = data;

    if (!items || items.length === 0) {
      throw new Error('يجب إضافة صنف واحد على الأقل في فاتورة البيع');
    }

    const accountingPeriod = invoiceDate.substring(0, 7); // Format: 'YYYY-MM'

    // المعاملة السحابية في Firestore
    const result = await db.runTransaction(async (transaction) => {
      // 1. التحقق من توفر كميات كل صنف في المخزون
      const itemDocs = [];
      let calculatedSubtotal = 0;

      for (const item of items) {
        const itemRef = db.collection('items').doc(item.itemId);
        const itemDoc = await transaction.get(itemRef);

        if (!itemDoc.exists) {
          throw new Error(`الصنف (${item.cropName || item.itemId}) غير موجود`);
        }

        const itemData = itemDoc.data();
        const availableStock = Number(itemData.current_stock || 0);
        const requestedQty = Number(item.quantity || 0);

        if (requestedQty <= 0) {
          throw new Error(`كمية الصنف (${itemData.name}) يجب أن تكون أكبر من الصفر`);
        }

        if (availableStock < requestedQty) {
          throw new Error(`المخزون المتوفر من (${itemData.name}) هو ${availableStock} ${itemData.unit} فقط، والكمية المطلوبة للبيع ${requestedQty} ${itemData.unit}`);
        }

        const lineTotal = requestedQty * Number(item.unitPrice || 0);
        calculatedSubtotal += lineTotal;

        itemDocs.push({
          ref: itemRef,
          data: itemData,
          requestedQty,
          unit: item.unit || itemData.unit || 'فلين',
          unitPrice: Number(item.unitPrice || 0),
          lineTotal
        });
      }

      // 2. الحسابات المالية للفاتورة
      const numDiscount = Number(discount || 0);
      const totalAmount = Math.max(0, calculatedSubtotal - numDiscount);
      const actualPaid = paidAmount !== undefined && paidAmount !== '' ? Number(paidAmount) : totalAmount;

      let paymentStatus = 'PAID';
      if (actualPaid < totalAmount) {
        paymentStatus = actualPaid <= 0 ? 'UNPAID' : 'PARTIAL';
      }

      // 3. توليد رقم الفاتورة
      const invoiceRef = db.collection('sales_invoices').doc();
      const invoiceNumber = `INV-${accountingPeriod.replace('-', '')}-${invoiceRef.id.substring(0, 5).toUpperCase()}`;

      // 4. خصم المخزون وتسجيل حركات الإخراج (SALE_OUT)
      const invoiceItems = [];
      for (const entry of itemDocs) {
        const newStock = Number(entry.data.current_stock || 0) - entry.requestedQty;
        const chosenUnit = entry.unit || entry.data.unit || 'فلين';

        // خصم من رصيد الصنف
        transaction.update(entry.ref, {
          current_stock: newStock,
          updated_at: FieldValue.serverTimestamp()
        });

        // حركة خروج مخزني
        const movementRef = db.collection('stock_movements').doc();
        transaction.set(movementRef, {
          id: movementRef.id,
          item_id: entry.ref.id,
          crop_name: entry.data.name,
          movement_type: 'SALE_OUT',
          quantity: -entry.requestedQty,
          stock_after: newStock,
          unit: chosenUnit,
          unit_price: entry.unitPrice,
          total_price: entry.lineTotal,
          reference_type: 'sales_invoices',
          reference_id: invoiceRef.id,
          date: invoiceDate,
          accounting_period: accountingPeriod,
          created_at: FieldValue.serverTimestamp()
        });

        invoiceItems.push({
          item_id: entry.ref.id,
          crop_name: entry.data.name,
          quantity: entry.requestedQty,
          unit: chosenUnit,
          unit_price: entry.unitPrice,
          total_price: entry.lineTotal
        });
      }

      // 5. حفظ وثيقة الفاتورة
      const invoiceDoc = {
        id: invoiceRef.id,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        accounting_period: accountingPeriod,
        customer_name: customerName,
        customer_phone: customerPhone,
        issuer_name: data.issuerName || data.issuer_name || '',
        issuer_phone: data.issuerPhone || data.issuer_phone || '',
        payment_method: paymentMethod,
        subtotal: calculatedSubtotal,
        discount: numDiscount,
        total_amount: totalAmount,
        paid_amount: actualPaid,
        remaining_amount: Math.max(0, totalAmount - actualPaid),
        payment_status: paymentStatus,
        notes: notes,
        items: invoiceItems,
        created_at: FieldValue.serverTimestamp()
      };

      transaction.set(invoiceRef, invoiceDoc);

      // 6. تحديث التقرير الشهري التراكمي (Monthly Report)
      const monthlySummaryRef = db.collection('monthly_reports').doc(accountingPeriod);
      const updateData = {
        period: accountingPeriod,
        total_monthly_sales: FieldValue.increment(totalAmount),
        total_monthly_collected: FieldValue.increment(actualPaid),
        total_monthly_credit: FieldValue.increment(Math.max(0, totalAmount - actualPaid)),
        updated_at: FieldValue.serverTimestamp()
      };

      for (const entry of itemDocs) {
        updateData[`crops.${entry.ref.id}.name`] = entry.data.name;
        updateData[`crops.${entry.ref.id}.total_sales_revenue`] = FieldValue.increment(entry.lineTotal);
        updateData[`crops.${entry.ref.id}.total_sold_qty`] = FieldValue.increment(entry.requestedQty);
      }

      transaction.set(monthlySummaryRef, updateData, { merge: true });

      return {
        invoiceId: invoiceRef.id,
        invoiceNumber,
        totalAmount,
        paymentStatus
      };
    });

    return result;
  },

  /**
   * جلب فواتير المبيعات
   */
  async getSalesInvoices(filters = {}) {
    let query = db.collection('sales_invoices');

    if (filters.period) {
      query = query.where('accounting_period', '==', filters.period);
    }
    if (filters.paymentStatus) {
      query = query.where('payment_status', '==', filters.paymentStatus);
    }

    const snapshot = await query.get();
    const invoices = [];
    snapshot.forEach(doc => invoices.push(doc.data()));

    return invoices.sort((a, b) => (b.invoice_date > a.invoice_date ? 1 : -1));
  },

  /**
   * جلب تفاصيل فاتورة محددة للطباعة مع إعدادات المزرعة
   */
  async getInvoiceById(invoiceId) {
    const invDoc = await db.collection('sales_invoices').doc(invoiceId).get();
    if (!invDoc.exists) throw new Error('الفاتورة غير موجودة');

    const settingsDoc = await db.collection('settings').doc('farm_profile').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : { farm_name: 'مزرعة ابو خليفه', currency: 'ريال' };
    if (!settings.farm_name || settings.farm_name === 'مزرعة الخير النموذجية') {
      settings.farm_name = 'مزرعة ابو خليفه';
    }

    return {
      ...invDoc.data(),
      settings
    };
  },

  /**
   * تعديل فاتورة بيع بعد إصدارها وإعادة ضبط المخزون والحسابات بدقة
   */
  async updateSalesInvoice(invoiceId, data) {
    const {
      invoiceDate = new Date().toISOString().split('T')[0],
      customerName = 'عميل نقدي',
      customerPhone = '',
      issuerName = '',
      issuerPhone = '',
      paymentMethod = 'cash',
      paidAmount,
      discount = 0,
      notes = '',
      items = []
    } = data;

    if (!items || items.length === 0) {
      throw new Error('يجب إضافة صنف واحد على الأقل في فاتورة البيع');
    }

    const accountingPeriod = invoiceDate.substring(0, 7);

    return await db.runTransaction(async (transaction) => {
      const invRef = db.collection('sales_invoices').doc(invoiceId);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists) {
        throw new Error('فاتورة البيع غير موجودة');
      }

      const oldInv = invDoc.data();

      // 1. استرجاع أرصدة الأصناف القديمة مؤقتاً لحساب الرصيد الفعلي المتوفر
      const itemStockTracker = {};
      for (const oldItem of (oldInv.items || [])) {
        const itemRef = db.collection('items').doc(oldItem.item_id);
        const itemDoc = await transaction.get(itemRef);
        if (itemDoc.exists) {
          const currentStock = Number(itemDoc.data().current_stock || 0);
          const restored = currentStock + Number(oldItem.quantity || 0);
          itemStockTracker[oldItem.item_id] = {
            ref: itemRef,
            data: itemDoc.data(),
            stock: restored
          };
        }
      }

      // 2. التحقق من توفر كميات الأصناف الجديدة وخصمها
      const newItemDocs = [];
      let calculatedSubtotal = 0;

      for (const item of items) {
        let itemRef, itemData, currentAvailable;

        if (itemStockTracker[item.itemId]) {
          itemRef = itemStockTracker[item.itemId].ref;
          itemData = itemStockTracker[item.itemId].data;
          currentAvailable = itemStockTracker[item.itemId].stock;
        } else {
          itemRef = db.collection('items').doc(item.itemId);
          const itemDoc = await transaction.get(itemRef);
          if (!itemDoc.exists) {
            throw new Error(`الصنف (${item.cropName || item.itemId}) غير موجود`);
          }
          itemData = itemDoc.data();
          currentAvailable = Number(itemData.current_stock || 0);
          itemStockTracker[item.itemId] = {
            ref: itemRef,
            data: itemData,
            stock: currentAvailable
          };
        }

        const requestedQty = Number(item.quantity || 0);
        if (requestedQty <= 0) {
          throw new Error(`كمية الصنف (${itemData.name}) يجب أن تكون أكبر من الصفر`);
        }

        if (currentAvailable < requestedQty) {
          throw new Error(`المخزون المتوفر من (${itemData.name}) بعد التعديل هو ${currentAvailable} ${itemData.unit || 'وحدة'} فقط، والمطلوب ${requestedQty}`);
        }

        itemStockTracker[item.itemId].stock = currentAvailable - requestedQty;

        const lineTotal = requestedQty * Number(item.unitPrice || 0);
        calculatedSubtotal += lineTotal;

        newItemDocs.push({
          ref: itemRef,
          data: itemData,
          requestedQty,
          unit: item.unit || itemData.unit || 'فلين',
          unitPrice: Number(item.unitPrice || 0),
          lineTotal
        });
      }

      // 3. تطبيق تحديث المخزون النهائي في Firestore
      for (const itemId in itemStockTracker) {
        const itemObj = itemStockTracker[itemId];
        transaction.update(itemObj.ref, {
          current_stock: itemObj.stock,
          updated_at: FieldValue.serverTimestamp()
        });
      }

      // 4. الحسابات المالية الجديدة
      const numDiscount = Number(discount || 0);
      const totalAmount = Math.max(0, calculatedSubtotal - numDiscount);
      const actualPaid = paidAmount !== undefined && paidAmount !== '' ? Number(paidAmount) : totalAmount;

      let paymentStatus = 'PAID';
      if (actualPaid < totalAmount) {
        paymentStatus = actualPaid <= 0 ? 'UNPAID' : 'PARTIAL';
      }

      const newInvoiceItems = newItemDocs.map(entry => ({
        item_id: entry.ref.id,
        crop_name: entry.data.name,
        quantity: entry.requestedQty,
        unit: entry.unit,
        unit_price: entry.unitPrice,
        total_price: entry.lineTotal
      }));

      // 5. ضبط التقرير الشهري (عكس القديم وإضافة الجديد)
      const oldPeriodRef = db.collection('monthly_reports').doc(oldInv.accounting_period);
      const reverseOldUpdate = {
        total_monthly_sales: FieldValue.increment(-Number(oldInv.total_amount || 0)),
        total_monthly_collected: FieldValue.increment(-Number(oldInv.paid_amount || 0)),
        total_monthly_credit: FieldValue.increment(-Number(oldInv.remaining_amount || 0)),
        updated_at: FieldValue.serverTimestamp()
      };
      for (const oldItm of (oldInv.items || [])) {
        reverseOldUpdate[`crops.${oldItm.item_id}.total_sales_revenue`] = FieldValue.increment(-Number(oldItm.total_price || 0));
        reverseOldUpdate[`crops.${oldItm.item_id}.total_sold_qty`] = FieldValue.increment(-Number(oldItm.quantity || 0));
      }
      transaction.set(oldPeriodRef, reverseOldUpdate, { merge: true });

      const newPeriodRef = db.collection('monthly_reports').doc(accountingPeriod);
      const applyNewUpdate = {
        period: accountingPeriod,
        total_monthly_sales: FieldValue.increment(totalAmount),
        total_monthly_collected: FieldValue.increment(actualPaid),
        total_monthly_credit: FieldValue.increment(Math.max(0, totalAmount - actualPaid)),
        updated_at: FieldValue.serverTimestamp()
      };
      for (const newItm of newItemDocs) {
        applyNewUpdate[`crops.${newItm.ref.id}.name`] = newItm.data.name;
        applyNewUpdate[`crops.${newItm.ref.id}.total_sales_revenue`] = FieldValue.increment(newItm.lineTotal);
        applyNewUpdate[`crops.${newItm.ref.id}.total_sold_qty`] = FieldValue.increment(newItm.requestedQty);
      }
      transaction.set(newPeriodRef, applyNewUpdate, { merge: true });

      // 6. تحديث وثيقة الفاتورة
      const updatedInvoiceData = {
        invoice_date: invoiceDate,
        accounting_period: accountingPeriod,
        customer_name: customerName,
        customer_phone: customerPhone,
        issuer_name: issuerName || oldInv.issuer_name || '',
        issuer_phone: issuerPhone || oldInv.issuer_phone || '',
        payment_method: paymentMethod,
        subtotal: calculatedSubtotal,
        discount: numDiscount,
        total_amount: totalAmount,
        paid_amount: actualPaid,
        remaining_amount: Math.max(0, totalAmount - actualPaid),
        payment_status: paymentStatus,
        notes: notes,
        items: newInvoiceItems,
        updated_at: FieldValue.serverTimestamp()
      };

      transaction.update(invRef, updatedInvoiceData);

      return {
        success: true,
        invoiceId,
        invoiceNumber: oldInv.invoice_number,
        totalAmount,
        paymentStatus,
        message: 'تم تحديث فاتورة البيع وضبط المخزون بنجاح'
      };
    });
  },

  /**
   * حذف فاتورة بيع واسترجاع كميات المخزون في السحابة
   */
  async deleteSalesInvoice(invoiceId) {
    return await db.runTransaction(async (transaction) => {
      const invRef = db.collection('sales_invoices').doc(invoiceId);
      const invDoc = await transaction.get(invRef);

      if (!invDoc.exists) throw new Error('الفاتورة غير موجودة');

      const invData = invDoc.data();

      // إعادة الكميات إلى المخزون
      for (const item of (invData.items || [])) {
        const itemRef = db.collection('items').doc(item.item_id);
        const itemDoc = await transaction.get(itemRef);

        if (itemDoc.exists) {
          const currentStock = Number(itemDoc.data().current_stock || 0);
          const restoredStock = currentStock + Number(item.quantity);

          transaction.update(itemRef, {
            current_stock: restoredStock,
            updated_at: FieldValue.serverTimestamp()
          });

          // حركة تصحيحية للمخزون
          const movementRef = db.collection('stock_movements').doc();
          transaction.set(movementRef, {
            id: movementRef.id,
            item_id: item.item_id,
            crop_name: item.crop_name,
            movement_type: 'ADJUSTMENT',
            quantity: Number(item.quantity),
            stock_after: restoredStock,
            notes: `استرجاع مخزون بسبب إلغاء الفاتورة ${invData.invoice_number}`,
            created_at: FieldValue.serverTimestamp()
          });
        }
      }

      // عكس الأثر المالي من التقرير الشهري
      const monthlySummaryRef = db.collection('monthly_reports').doc(invData.accounting_period);
      const updateData = {
        total_monthly_sales: FieldValue.increment(-Number(invData.total_amount || 0)),
        total_monthly_collected: FieldValue.increment(-Number(invData.paid_amount || 0)),
        updated_at: FieldValue.serverTimestamp()
      };

      for (const item of (invData.items || [])) {
        updateData[`crops.${item.item_id}.total_sales_revenue`] = FieldValue.increment(-Number(item.total_price || 0));
        updateData[`crops.${item.item_id}.total_sold_qty`] = FieldValue.increment(-Number(item.quantity || 0));
      }

      transaction.set(monthlySummaryRef, updateData, { merge: true });
      transaction.delete(invRef);

      return { success: true, message: 'تم إلغاء الفاتورة واسترجاع كميات المخزون بنجاح' };
    });
  }
};

module.exports = salesService;
