export class AdminRepository {
  constructor(private readonly db: D1Database) {}

  async sales(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    const result = await this.db
      .prepare(
        `
      SELECT s.id,s.payment_method AS paymentMethod,s.total_cents AS totalCents,
        s.created_at AS createdAt,u.display_name AS sellerName,l.name AS locationName,
        r.id AS refundId,r.notes AS refundNotes,
        COALESCE((SELECT json_group_array(json_object('id',x.id,'productName',x.product_name,'quantity',x.quantity,'unitPriceCents',x.unit_price_cents,'totalCents',x.total_cents)) FROM
          (SELECT si.* FROM sale_items si WHERE si.sale_id=s.id AND si.deleted_at IS NULL ORDER BY si.created_at,si.id) x),'[]') AS items
      FROM sales s JOIN users u ON u.id=s.seller_id
      LEFT JOIN locations l ON l.id=s.location_id
      LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL
      WHERE s.business_id=? AND s.deleted_at IS NULL AND
        (?='%%' OR u.display_name LIKE ? COLLATE NOCASE OR CAST(s.total_cents AS TEXT) LIKE ? OR EXISTS
          (SELECT 1 FROM sale_items si WHERE si.sale_id=s.id AND si.product_name LIKE ? COLLATE NOCASE))
      ORDER BY s.created_at DESC,s.id DESC LIMIT 500`,
      )
      .bind(businessId, term, term, term, term)
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
        u.display_name AS sellerName,l.name AS locationName,
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

  async dashboard(businessId: string) {
    const [sales, inventory, finance, products] = await Promise.all([
      this.db
        .prepare(
          `SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN r.id IS NULL THEN s.total_cents ELSE 0 END),0) AS salesCents,COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN s.total_cents ELSE 0 END),0) AS refundsCents FROM sales s LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL WHERE s.business_id=? AND s.deleted_at IS NULL`,
        )
        .bind(businessId)
        .first(),
      this.db
        .prepare(
          `SELECT COALESCE(SUM(bs.quantity),0) AS units,COALESCE(SUM(bs.quantity*b.unit_cost_cents),0) AS costCents FROM inventory_batch_stocks bs JOIN inventory_batches b ON b.id=bs.batch_id WHERE bs.business_id=? AND b.deleted_at IS NULL`,
        )
        .bind(businessId)
        .first(),
      this.db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN type IN ('capitalInjection','sessionClose','positiveAdjustment') THEN amount_cents ELSE -amount_cents END),0) AS balanceCents FROM financial_movements WHERE business_id=? AND deleted_at IS NULL`,
        )
        .bind(businessId)
        .first(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS products FROM products WHERE business_id=? AND deleted_at IS NULL AND is_active=1`,
        )
        .bind(businessId)
        .first(),
    ]);
    const recent = await this.db
      .prepare(
        `SELECT s.id,s.created_at AS createdAt,s.total_cents AS totalCents,s.payment_method AS paymentMethod,u.display_name AS sellerName FROM sales s JOIN users u ON u.id=s.seller_id WHERE s.business_id=? AND s.deleted_at IS NULL ORDER BY s.created_at DESC LIMIT 8`,
      )
      .bind(businessId)
      .all();
    return { sales, inventory, finance, products, recentSales: recent.results };
  }
}
