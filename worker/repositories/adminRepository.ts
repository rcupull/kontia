export class AdminRepository {
  constructor(private readonly db: D1Database) {}

  async sales(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `
      SELECT s.id,s.payment_method AS paymentMethod,s.total_cents AS totalCents,
        s.created_at AS createdAt,u.display_name AS sellerName,l.name AS locationName,l.type AS locationType,
        r.id AS refundId,r.notes AS refundNotes,
        (SELECT json_extract(a.metadata,'$.notes') FROM audit_logs a
          WHERE a.business_id=s.business_id AND a.entity_type='sale' AND a.entity_id=s.id
            AND a.action='priceOverride' AND a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 1) AS notes,
        COALESCE((SELECT json_group_array(json_object('id',x.id,'productName',x.product_name,'quantity',x.quantity,'unitPriceCents',x.unit_price_cents,'totalCents',x.total_cents)) FROM
          (SELECT si.* FROM sale_items si WHERE si.sale_id=s.id AND si.deleted_at IS NULL ORDER BY si.created_at,si.id) x),'[]') AS items
      FROM sales s JOIN users u ON u.id=s.seller_id
      LEFT JOIN locations l ON l.id=s.location_id
      LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL
      WHERE s.business_id=? AND s.deleted_at IS NULL AND
        (?='%%' OR u.display_name LIKE ? COLLATE NOCASE OR l.name LIKE ? COLLATE NOCASE OR CAST(s.total_cents AS TEXT) LIKE ? OR EXISTS
          (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND si.product_name LIKE ? COLLATE NOCASE))
      ORDER BY s.created_at DESC,s.id DESC LIMIT 500`,
      )
      .bind(businessId, term, term, term, term, term)
      .all<Record<string, unknown>>();
    return result.results.map((row) => ({
      ...row,
      items: JSON.parse(String(row.items ?? "[]")),
    }));
  }

  async sessions(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `
      SELECT cs.id,cs.status,cs.opened_at AS openedAt,cs.closed_at AS closedAt,
        cs.opening_amount_cents AS openingAmountCents,cs.expected_cash_amount_cents AS expectedCashAmountCents,
        cs.counted_cash_amount_cents AS countedCashAmountCents,cs.difference_cents AS differenceCents,
        u.display_name AS sellerName,l.name AS locationName,l.type AS locationType,
        COUNT(DISTINCT s.id) AS totalOrders,
        COALESCE(SUM(CASE WHEN r.id IS NULL THEN s.total_cents ELSE 0 END),0) AS netSalesCents,
        COALESCE(SUM(CASE WHEN r.id IS NULL AND s.payment_method='cash' THEN s.total_cents ELSE 0 END),0) AS cashSalesCents,
        COALESCE(SUM(CASE WHEN r.id IS NULL AND s.payment_method='card' THEN s.total_cents ELSE 0 END),0) AS cardSalesCents,
        COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN s.total_cents ELSE 0 END),0) AS refundsCents
      FROM cash_sessions cs JOIN users u ON u.id=cs.seller_id
      LEFT JOIN locations l ON l.id=cs.location_id
      LEFT JOIN sales s ON s.cash_session_id=cs.id AND s.deleted_at IS NULL
      LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL
      WHERE cs.business_id=? AND cs.deleted_at IS NULL AND (?='%%' OR u.display_name LIKE ? COLLATE NOCASE)
      GROUP BY cs.id ORDER BY cs.opened_at DESC,cs.id DESC LIMIT 500`,
      )
      .bind(businessId, term, term)
      .all();
    return result.results;
  }

  async financial(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    return (
      await this.db
        .prepare(
          `SELECT id,type,expense_type AS expenseType,money_location AS moneyLocation,amount_cents AS amountCents,description,movement_date AS movementDate,notes,related_entity_type AS relatedEntityType,related_entity_id AS relatedEntityId,created_at AS createdAt FROM financial_movements WHERE business_id=? AND deleted_at IS NULL AND (?='%%' OR description LIKE ? COLLATE NOCASE OR notes LIKE ? COLLATE NOCASE OR type LIKE ? COLLATE NOCASE OR money_location LIKE ? COLLATE NOCASE) ORDER BY movement_date DESC,id DESC LIMIT 500`,
        )
        .bind(businessId, term, term, term, term, term)
        .all()
    ).results;
  }

  async saveFinancial(
    businessId: string,
    userId: string,
    id: string | null,
    input: Record<string, unknown>,
  ) {
    const values = [
      input.type,
      input.expenseType || null,
      input.moneyLocation,
      input.amountCents,
      input.description,
      input.movementDate,
      input.notes || null,
    ];
    if (id) {
      const result = await this.db
        .prepare(
          `UPDATE financial_movements SET type=?,expense_type=?,money_location=?,amount_cents=?,description=?,movement_date=?,notes=?,updated_at=datetime('now') WHERE id=? AND business_id=? AND deleted_at IS NULL AND related_entity_type IS NULL AND related_entity_id IS NULL`,
        )
        .bind(...values, id, businessId)
        .run();
      return Number(result.meta.changes) > 0 ? id : null;
    }
    const nextId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO financial_movements (id,business_id,type,expense_type,money_location,amount_cents,description,movement_date,notes,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(nextId, businessId, ...values, userId)
      .run();
    return nextId;
  }

  async dashboard(businessId: string, from?: string, to?: string) {
    const range = (column: string) =>
      `(? IS NULL OR datetime(${column}) >= datetime(?)) AND (? IS NULL OR datetime(${column}) <= datetime(?))`;
    const bindRange = (statement: D1PreparedStatement) =>
      statement.bind(
        businessId,
        from ?? null,
        from ?? null,
        to ?? null,
        to ?? null,
      );
    const [
      business,
      saleRows,
      refundRows,
      wasteRows,
      expenseRows,
      financeRows,
      financeBalances,
      inventoryRows,
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT sales_tax_percentage AS tax FROM businesses WHERE id=?`,
        )
        .bind(businessId)
        .first<{ tax: number }>(),
      bindRange(
        this.db.prepare(`
            SELECT date(s.created_at) AS day,p.id AS productId,p.name AS productName,s.payment_method AS paymentMethod,
              COUNT(DISTINCT s.id) AS orders,SUM(si.quantity) AS units,SUM(si.total_cents) AS grossCents,
              SUM(si.quantity*b.unit_cost_cents) AS costCents
            FROM sales s JOIN sale_items si ON si.sale_id=s.id AND si.deleted_at IS NULL
            JOIN products p ON p.id=si.product_id LEFT JOIN inventory_batches b ON b.id=si.batch_id
            WHERE s.business_id=? AND s.deleted_at IS NULL AND ${range("s.created_at")}
            GROUP BY day,p.id,s.payment_method`),
      ).all<Record<string, unknown>>(),
      bindRange(
        this.db.prepare(`
            SELECT date(r.created_at) AS day,p.id AS productId,p.name AS productName,s.payment_method AS paymentMethod,
              COUNT(DISTINCT r.id) AS refunds,SUM(si.quantity) AS units,SUM(si.total_cents) AS refundCents,
              SUM(si.quantity*b.unit_cost_cents) AS costCents
            FROM sale_refunds r JOIN sales s ON s.id=r.sale_id AND s.deleted_at IS NULL
            JOIN sale_items si ON si.sale_id=s.id AND si.deleted_at IS NULL JOIN products p ON p.id=si.product_id
            LEFT JOIN inventory_batches b ON b.id=si.batch_id
            WHERE r.business_id=? AND r.deleted_at IS NULL AND ${range("r.created_at")}
            GROUP BY day,p.id,s.payment_method`),
      ).all<Record<string, unknown>>(),
      bindRange(
        this.db.prepare(`
            SELECT date(m.created_at) AS day,p.id AS productId,p.name AS productName,l.type AS locationType,
              SUM(m.quantity) AS units,SUM(m.quantity*b.unit_cost_cents) AS lossCents
            FROM inventory_movements m JOIN inventory_batches b ON b.id=m.batch_id JOIN products p ON p.id=m.product_id
            LEFT JOIN locations l ON l.id=m.source_location_id
            WHERE m.business_id=? AND m.deleted_at IS NULL AND m.movement_type='waste' AND ${range("m.created_at")}
            GROUP BY day,p.id,l.type`),
      ).all<Record<string, unknown>>(),
      bindRange(
        this.db.prepare(`
            SELECT date(movement_date) AS day,expense_type AS expenseType,SUM(amount_cents) AS amountCents
            FROM financial_movements WHERE business_id=? AND deleted_at IS NULL AND type='operatingExpense'
              AND ${range("movement_date")} GROUP BY day,expense_type`),
      ).all<Record<string, unknown>>(),
      bindRange(
        this.db.prepare(`
            SELECT date(movement_date) AS day,type,money_location AS moneyLocation,SUM(amount_cents) AS amountCents
            FROM financial_movements WHERE business_id=? AND deleted_at IS NULL AND ${range("movement_date")}
            GROUP BY day,type,money_location`),
      ).all<Record<string, unknown>>(),
      this.db
        .prepare(
          `
            SELECT money_location AS moneyLocation,
              SUM(CASE WHEN type IN ('capitalInjection','sessionClose','positiveAdjustment') THEN amount_cents ELSE -amount_cents END) AS balanceCents
            FROM financial_movements WHERE business_id=? AND deleted_at IS NULL GROUP BY money_location`,
        )
        .bind(businessId)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `
            SELECT l.id,l.name,l.type,COALESCE(SUM(bs.quantity),0) AS units,
              COALESCE(SUM(bs.quantity*b.unit_cost_cents),0) AS valueCents
            FROM locations l LEFT JOIN inventory_batch_stocks bs ON bs.location_id=l.id
            LEFT JOIN inventory_batches b ON b.id=bs.batch_id AND b.deleted_at IS NULL
            WHERE l.business_id=? AND l.deleted_at IS NULL AND l.is_active=1 GROUP BY l.id ORDER BY l.type,l.name`,
        )
        .bind(businessId)
        .all<Record<string, unknown>>(),
    ]);

    type Metrics = {
      grossSales: number;
      netSales: number;
      refunds: number;
      grossCashSales: number;
      netCashSales: number;
      cashRefunds: number;
      grossTransferSales: number;
      netTransferSales: number;
      transferRefunds: number;
      cost: number;
      profit: number;
      expenses: number;
      wasteLoss: number;
      operatingResult: number;
      orders: number;
      units: number;
    };
    const empty = (): Metrics => ({
      grossSales: 0,
      netSales: 0,
      refunds: 0,
      grossCashSales: 0,
      netCashSales: 0,
      cashRefunds: 0,
      grossTransferSales: 0,
      netTransferSales: 0,
      transferRefunds: 0,
      cost: 0,
      profit: 0,
      expenses: 0,
      wasteLoss: 0,
      operatingResult: 0,
      orders: 0,
      units: 0,
    });
    const totals = empty(),
      daily: Record<string, Metrics> = {},
      products: Record<
        string,
        Metrics & { productId: string; productName: string }
      > = {};
    const metricFor = (day: string, productId: string, productName: string) => {
      daily[day] ??= empty();
      products[productId] ??= { ...empty(), productId, productName };
      return [totals, daily[day], products[productId]];
    };
    const taxRate = Number(business?.tax ?? 15) / 100;
    for (const row of saleRows.results) {
      const values = metricFor(
        String(row.day),
        String(row.productId),
        String(row.productName),
      );
      const gross = Number(row.grossCents ?? 0),
        cost = Number(row.costCents ?? 0);
      for (const value of values) {
        value.grossSales += gross;
        value.netSales += gross;
        value.cost += cost;
        value.profit += gross - gross * taxRate - cost;
        value.orders += Number(row.orders ?? 0);
        value.units += Number(row.units ?? 0);
        if (row.paymentMethod === "cash") {
          value.grossCashSales += gross;
          value.netCashSales += gross;
        } else {
          value.grossTransferSales += gross;
          value.netTransferSales += gross;
        }
      }
    }
    for (const row of refundRows.results) {
      const values = metricFor(
        String(row.day),
        String(row.productId),
        String(row.productName),
      );
      const refund = Number(row.refundCents ?? 0),
        cost = Number(row.costCents ?? 0);
      for (const value of values) {
        value.refunds += refund;
        value.netSales -= refund;
        value.cost -= cost;
        value.profit -= refund - refund * taxRate - cost;
        if (row.paymentMethod === "cash") {
          value.cashRefunds += refund;
          value.netCashSales -= refund;
        } else {
          value.transferRefunds += refund;
          value.netTransferSales -= refund;
        }
      }
    }
    for (const row of wasteRows.results) {
      const values = metricFor(
        String(row.day),
        String(row.productId),
        String(row.productName),
      );
      for (const value of values) value.wasteLoss += Number(row.lossCents ?? 0);
    }
    for (const row of expenseRows.results) {
      const day = String(row.day);
      daily[day] ??= empty();
      totals.expenses += Number(row.amountCents ?? 0);
      daily[day].expenses += Number(row.amountCents ?? 0);
    }
    for (const value of [
      totals,
      ...Object.values(daily),
      ...Object.values(products),
    ])
      value.operatingResult = value.profit - value.expenses - value.wasteLoss;

    const incoming = new Set([
      "capitalInjection",
      "sessionClose",
      "positiveAdjustment",
    ]);
    const financeSummary = {
      cashBalance: 0,
      bankBalance: 0,
      totalBalance: 0,
      totalIn: 0,
      totalOut: 0,
      netMovement: 0,
      operatingExpenses: 0,
      inventoryReinvestment: 0,
      ownerWithdrawals: 0,
      saleRefunds: 0,
    };
    for (const row of financeBalances.results) {
      if (row.moneyLocation === "cashDeposit")
        financeSummary.cashBalance += Number(row.balanceCents ?? 0);
      else financeSummary.bankBalance += Number(row.balanceCents ?? 0);
    }
    financeSummary.totalBalance =
      financeSummary.cashBalance + financeSummary.bankBalance;
    const financeDaily: Record<
      string,
      { in: number; out: number; net: number }
    > = {};
    const financeByType: Record<string, number> = {},
      expensesByType: Record<string, number> = {};
    for (const row of financeRows.results) {
      const amount = Number(row.amountCents ?? 0),
        type = String(row.type),
        day = String(row.day);
      const isIn = incoming.has(type);
      financeDaily[day] ??= { in: 0, out: 0, net: 0 };
      if (isIn) {
        financeSummary.totalIn += amount;
        financeDaily[day].in += amount;
        financeDaily[day].net += amount;
      } else {
        financeSummary.totalOut += amount;
        financeDaily[day].out += amount;
        financeDaily[day].net -= amount;
      }
      financeByType[type] = (financeByType[type] ?? 0) + amount;
      if (type === "inventoryReinvestment")
        financeSummary.inventoryReinvestment += amount;
      if (type === "ownerWithdrawal") financeSummary.ownerWithdrawals += amount;
      if (type === "saleRefund") financeSummary.saleRefunds += amount;
    }
    financeSummary.operatingExpenses = totals.expenses;
    financeSummary.netMovement =
      financeSummary.totalIn - financeSummary.totalOut;
    for (const row of expenseRows.results) {
      const type = String(row.expenseType || "other");
      expensesByType[type] =
        (expensesByType[type] ?? 0) + Number(row.amountCents ?? 0);
    }
    const inventory = inventoryRows.results.map((row) => ({
      ...row,
      units: Number(row.units ?? 0),
      valueCents: Number(row.valueCents ?? 0),
    }));
    const waste = wasteRows.results.reduce<{
      warehouseCents: number;
      posCents: number;
    }>(
      (acc, row) => {
        const key =
          row.locationType === "point_of_sale" ? "posCents" : "warehouseCents";
        acc[key] += Number(row.lossCents ?? 0);
        return acc;
      },
      { warehouseCents: 0, posCents: 0 },
    );
    return {
      range: { from: from ?? null, to: to ?? null },
      totals,
      daily: Object.entries(daily)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, values]) => ({ day, ...values })),
      products: Object.values(products).sort((a, b) => b.netSales - a.netSales),
      finance: {
        summary: financeSummary,
        daily: Object.entries(financeDaily)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, values]) => ({ day, ...values })),
        byType: financeByType,
        expensesByType,
      },
      inventory: {
        locations: inventory,
        totalUnits: inventory.reduce((sum, row) => sum + row.units, 0),
        totalValueCents: inventory.reduce(
          (sum, row) => sum + row.valueCents,
          0,
        ),
        ...waste,
        totalWasteCents: waste.warehouseCents + waste.posCents,
      },
    };
  }
}
