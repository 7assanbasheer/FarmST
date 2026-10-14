const express = require('express');
const cors = require('cors');
const path = require('path');
const harvestService = require('./services/harvestService');
const expenseService = require('./services/expenseService');
const salesService = require('./services/salesService');
const reportService = require('./services/reportService');
const itemsService = require('./services/itemsService');
const walletService = require('./services/walletService');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// تقديم واجهة المستخدم الثابتة
app.use(express.static(path.join(__dirname, '..', 'public')));

// ------------------------------------------------------------------
// 1. مسارات الأصناف والمخزون (Items & Crops)
// ------------------------------------------------------------------
app.get('/api/items', async (req, res) => {
  try {
    const items = await itemsService.getAllItems(req.query.type);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/expense-categories', async (req, res) => {
  try {
    const categories = await itemsService.getExpenseCategories();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 2. مسارات الحصاد والإنتاج (Harvest Operations)
// ------------------------------------------------------------------
app.get('/api/harvest', async (req, res) => {
  try {
    const logs = await harvestService.getHarvestLogs({
      period: req.query.period,
      itemId: req.query.itemId
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/harvest', async (req, res) => {
  try {
    const result = await harvestService.recordHarvest(req.body);
    res.json({ success: true, ...result, message: 'تم توثيق الحصاد وتحديث المخزون في السحابة بنجاح!' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/harvest/:id', async (req, res) => {
  try {
    const result = await harvestService.deleteHarvestLog(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 3. مسارات المصاريف والتشغيل (Expense Operations)
// ------------------------------------------------------------------
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await expenseService.getExpenses({
      period: req.query.period,
      cropId: req.query.cropId,
      categoryId: req.query.categoryId
    });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const result = await expenseService.recordExpense(req.body);
    res.json({ success: true, ...result, message: 'تم حفظ المصروف وترحيله للحسابات السحابية بنجاح!' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const result = await expenseService.deleteExpense(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 4. مسارات المبيعات وفواتير البيع (Sales Operations)
// ------------------------------------------------------------------
app.get('/api/sales', async (req, res) => {
  try {
    const invoices = await salesService.getSalesInvoices({
      period: req.query.period,
      paymentStatus: req.query.paymentStatus
    });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales/:id', async (req, res) => {
  try {
    const invoice = await salesService.getInvoiceById(req.params.id);
    res.json(invoice);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/api/sales', async (req, res) => {
  try {
    const result = await salesService.createSalesInvoice(req.body);
    res.json({ success: true, ...result, message: 'تم إصدار فاتورة البيع وخصم المخزون بنجاح!' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/sales/:id', async (req, res) => {
  try {
    const result = await salesService.deleteSalesInvoice(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 5. محرك التقارير والأرباح الشهرية (Monthly P&L & Crop Economics)
// ------------------------------------------------------------------
app.get('/api/reports/monthly', async (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().substring(0, 7);
    const report = await reportService.getMonthlyPnL(period);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 6. مسارات المحافظ والعهد النقدية والمستخدمين (Wallets & Custody)
// ------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await walletService.login(req.body);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await walletService.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallets/deposit', async (req, res) => {
  try {
    const result = await walletService.depositToWallet(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/wallets/transfers', async (req, res) => {
  try {
    const transfers = await walletService.getTransfers({
      userId: req.query.userId,
      status: req.query.status
    });
    res.json(transfers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallets/transfer', async (req, res) => {
  try {
    const result = await walletService.createTransfer(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/wallets/transfers/:id/confirm', async (req, res) => {
  try {
    const result = await walletService.confirmTransfer(req.params.id, req.body.receiverId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/wallets/transfers/:id/reject', async (req, res) => {
  try {
    const result = await walletService.rejectTransfer(req.params.id, req.body.userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/wallets/transactions/:userId', async (req, res) => {
  try {
    const transactions = await walletService.getUserTransactions(req.params.userId);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`🌾 خادم نظام المزرعة السحابي (Firebase) يعمل بنجاح على: http://localhost:${PORT}`);
});
