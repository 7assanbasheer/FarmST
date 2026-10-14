-- ====================================================================
-- مخطط قاعدة بيانات نظام إدارة المزرعة (Farm Management System Schema)
-- المحرك: PostgreSQL
-- ====================================================================

-- 1. مراكز التكلفة والمحاصيل (Cost Centers)
CREATE TABLE IF NOT EXISTS cost_centers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. شجرة الحسابات المالية (Chart of Accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    parent_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. الأصناف (محاصيل الإنتاج، مدخلات ومواد خام، مستلزمات تعبئة)
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE,
    name VARCHAR(150) NOT NULL,
    item_type VARCHAR(30) NOT NULL CHECK (item_type IN ('CROP_PRODUCT', 'RAW_MATERIAL', 'CONSUMABLE', 'SERVICE')),
    default_unit VARCHAR(50) NOT NULL DEFAULT 'كجم',
    cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
    default_sell_price NUMERIC(12, 2) DEFAULT 0,
    min_stock_alert NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. الأطراف (العملاء والموردين)
CREATE TABLE IF NOT EXISTS parties (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    party_type VARCHAR(30) NOT NULL CHECK (party_type IN ('CUSTOMER', 'SUPPLIER', 'BOTH')),
    phone VARCHAR(50),
    tax_number VARCHAR(50),
    balance NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. سجل دورات الحصاد والإنتاج اليومي
CREATE TABLE IF NOT EXISTS harvest_logs (
    id SERIAL PRIMARY KEY,
    harvest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(7) NOT NULL, -- الصيغة الشهري: 'YYYY-MM'
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) NOT NULL,
    field_location VARCHAR(150) DEFAULT 'الحقل الرئيسي',
    quality_grade VARCHAR(50) DEFAULT 'نخب أول',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. سجل حركات المخزون الموحد (Stock Movement Ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('HARVEST_IN', 'PURCHASE_IN', 'SALE_OUT', 'CONSUMPTION_OUT', 'ADJUSTMENT')),
    quantity NUMERIC(12, 2) NOT NULL, -- موجبة للإدخال، سالبة للإخراج
    unit_cost NUMERIC(12, 4) DEFAULT 0,
    total_cost NUMERIC(12, 2) DEFAULT 0,
    reference_table VARCHAR(50) NOT NULL, -- 'harvest_logs', 'sales_invoices', 'purchase_invoices'
    reference_id INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. فواتير الشراء (المستلزمات، الأعلاف، الأسمدة، الفلين والكراتين)
CREATE TABLE IF NOT EXISTS purchase_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(7) NOT NULL,
    supplier_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    supplier_name VARCHAR(150),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK', 'CREDIT')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. بنود فواتير الشراء
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    item_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0)
);

-- 9. فواتير المبيعات (بيع المحاصيل للعملاء والتجار)
CREATE TABLE IF NOT EXISTS sales_invoices (
    id SERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(7) NOT NULL,
    customer_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
    customer_name VARCHAR(150) DEFAULT 'عميل نقدي',
    customer_phone VARCHAR(50),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID' CHECK (payment_status IN ('PAID', 'PARTIAL', 'UNPAID')),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK', 'CREDIT')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. بنود فواتير المبيعات
CREATE TABLE IF NOT EXISTS sales_invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    item_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0)
);

-- 11. سندات الصرف والمصاريف التشغيلية ومصاريف الإنتاج
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(7) NOT NULL,
    title VARCHAR(200) NOT NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL, -- يربط بالمحصول أو يُترك فارغاً للمصاريف العامة
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK', 'CREDIT')),
    recipient VARCHAR(150),
    invoice_ref VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. قيود اليومية المحاسبية التلقائية (General Ledger)
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    entry_number VARCHAR(50) UNIQUE NOT NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(7) NOT NULL,
    description TEXT,
    source_type VARCHAR(50),
    source_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. أسطر القيود المحاسبية
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    cost_center_id INTEGER REFERENCES cost_centers(id) ON DELETE SET NULL,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0,
    notes TEXT
);

-- فهارس لتحسين سرعة التقارير الشهرية وحركات المخزون (Indexes)
CREATE INDEX IF NOT EXISTS idx_harvest_period ON harvest_logs(accounting_period);
CREATE INDEX IF NOT EXISTS idx_stock_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_period ON sales_invoices(accounting_period);
CREATE INDEX IF NOT EXISTS idx_purchase_period ON purchase_invoices(accounting_period);
CREATE INDEX IF NOT EXISTS idx_expenses_period ON expenses(accounting_period);
CREATE INDEX IF NOT EXISTS idx_expenses_cost_center ON expenses(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_journal_period ON journal_entries(accounting_period);
