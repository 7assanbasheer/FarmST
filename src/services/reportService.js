const { db } = require('../db/firebase');

/**
 * خدمة محرك التكاليف الشهرية وتقارير الأرباح والخسائر (Monthly P&L Engine)
 */
const reportService = {
  /**
   * حساب تقرير الأرباح والخسائر الشامل وتكلفة الوحدة لكل محصول عن شهر محدد
   */
  async getMonthlyPnL(period = new Date().toISOString().substring(0, 7)) {
    // 1. جلب فواتير مبيعات الشهر
    const salesSnapshot = await db.collection('sales_invoices')
      .where('accounting_period', '==', period)
      .get();

    let totalMonthlySales = 0;
    let totalCollected = 0;
    let totalCredit = 0;
    const cropSalesMap = {}; // { itemId: { totalQty, totalRevenue } }

    salesSnapshot.forEach(doc => {
      const data = doc.data();
      totalMonthlySales += Number(data.total_amount || 0);
      totalCollected += Number(data.paid_amount || 0);
      totalCredit += Number(data.remaining_amount || 0);

      (data.items || []).forEach(item => {
        if (!cropSalesMap[item.item_id]) {
          cropSalesMap[item.item_id] = { cropName: item.crop_name, totalQty: 0, totalRevenue: 0, unit: item.unit };
        }
        cropSalesMap[item.item_id].totalQty += Number(item.quantity || 0);
        cropSalesMap[item.item_id].totalRevenue += Number(item.total_price || 0);
      });
    });

    // 2. جلب مصاريف الشهر
    const expSnapshot = await db.collection('expenses')
      .where('accounting_period', '==', period)
      .get();

    let totalMonthlyExpenses = 0;
    let generalOverheads = 0;
    const cropExpensesMap = {}; // { cropId: totalExpenses }
    const categoryBreakdown = {}; // { categoryName: total }

    expSnapshot.forEach(doc => {
      const data = doc.data();
      const amount = Number(data.amount || 0);
      totalMonthlyExpenses += amount;

      // تصنيف المصروف
      const cat = data.category_name || 'عام';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + amount;

      if (data.crop_id) {
        cropExpensesMap[data.crop_id] = (cropExpensesMap[data.crop_id] || 0) + amount;
      } else {
        generalOverheads += amount;
      }
    });

    // 3. جلب كميات الحصاد والإنتاج في هذا الشهر
    const harvestSnapshot = await db.collection('harvest_logs')
      .where('accounting_period', '==', period)
      .get();

    const cropHarvestMap = {}; // { itemId: totalQty }
    harvestSnapshot.forEach(doc => {
      const data = doc.data();
      const itemId = data.item_id;
      if (!cropHarvestMap[itemId]) {
        cropHarvestMap[itemId] = { cropName: data.crop_name, totalQty: 0, unit: data.unit };
      }
      cropHarvestMap[itemId].totalQty += Number(data.quantity || 0);
    });

    // 4. جلب جميع الأصناف لإعداد جدول التكاليف والربحية
    const itemsSnapshot = await db.collection('items').get();
    const allCrops = [];
    itemsSnapshot.forEach(doc => allCrops.push({ id: doc.id, ...doc.data() }));

    // تحديد المحاصيل النشطة في هذا الشهر (التي كان لها حصاد أو مصاريف أو مبيعات)
    const activeCropIds = new Set([
      ...Object.keys(cropHarvestMap),
      ...Object.keys(cropExpensesMap),
      ...Object.keys(cropSalesMap)
    ]);

    const activeCropsCount = activeCropIds.size || 1;
    // توزيع جزء من المصاريف العامة للمزرعة بالتساوي على المحاصيل النشطة لمعرفة التكلفة العادلة
    const allocatedOverheadPerCrop = generalOverheads / activeCropsCount;

    const cropAnalysis = [];

    allCrops.forEach(crop => {
      const hasHarvest = cropHarvestMap[crop.id];
      const hasExpense = cropExpensesMap[crop.id];
      const hasSale = cropSalesMap[crop.id];

      if (hasHarvest || hasExpense || hasSale) {
        const harvestQty = hasHarvest ? hasHarvest.totalQty : 0;
        const directExpense = hasExpense ? cropExpensesMap[crop.id] : 0;
        const totalExpense = directExpense + (harvestQty > 0 ? allocatedOverheadPerCrop : 0);

        // تكلفة إنتاج الوحدة الواحدة في هذا الشهر (Unit Cost)
        const unitCost = harvestQty > 0 ? (totalExpense / harvestQty) : 0;

        const soldQty = hasSale ? hasSale.totalQty : 0;
        const salesRevenue = hasSale ? hasSale.totalRevenue : 0;
        const avgSellPrice = soldQty > 0 ? (salesRevenue / soldQty) : Number(crop.default_sell_price || 0);

        // صافي ربح المحصول في هذا الشهر
        const netProfit = salesRevenue - totalExpense;
        const marginPct = salesRevenue > 0 ? ((netProfit / salesRevenue) * 100).toFixed(1) : 0;

        cropAnalysis.push({
          cropId: crop.id,
          cropName: crop.name,
          category: crop.category,
          unit: crop.unit,
          currentStock: Number(crop.current_stock || 0),
          harvestQty,
          directExpense,
          totalExpense,
          unitCost: Number(unitCost.toFixed(2)),
          soldQty,
          salesRevenue,
          avgSellPrice: Number(avgSellPrice.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          marginPct: Number(marginPct),
          isProfitable: netProfit >= 0
        });
      }
    });

    // ترتيب المحاصيل حسب صافي الربح من الأعلى إلى الأقل
    cropAnalysis.sort((a, b) => b.netProfit - a.netProfit);

    // صافي ربح المزرعة الإجمالي للشهر
    const netMonthlyProfit = totalMonthlySales - totalMonthlyExpenses;
    const overallMarginPct = totalMonthlySales > 0 ? ((netMonthlyProfit / totalMonthlySales) * 100).toFixed(1) : 0;

    return {
      period,
      totalMonthlySales: Number(totalMonthlySales.toFixed(2)),
      totalMonthlyExpenses: Number(totalMonthlyExpenses.toFixed(2)),
      netMonthlyProfit: Number(netMonthlyProfit.toFixed(2)),
      overallMarginPct: Number(overallMarginPct),
      isProfitable: netMonthlyProfit >= 0,
      totalCollected: Number(totalCollected.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      generalOverheads: Number(generalOverheads.toFixed(2)),
      categoryBreakdown,
      cropAnalysis
    };
  }
};

module.exports = reportService;
