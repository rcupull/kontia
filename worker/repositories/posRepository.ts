type SaleInput = {
  businessId: string;
  userId: string;
  operationId: string;
  createdAt: string;
  expectedTotalCents: number;
  paymentMethod: "cash" | "card";
  items: Array<{ productId: string; quantity: number }>;
};
type ActiveSession = {
  id: string;
  locationId: string;
  locationName: string;
  openingAmountCents: number;
  openedAt: string;
};
export class PosRepository {
  constructor(private readonly db: D1Database) {}
  private location(businessId: string, id: string) {
    return this.db
      .prepare(
        `SELECT id,name FROM locations WHERE id=? AND business_id=? AND type='point_of_sale' AND is_active=1 AND deleted_at IS NULL`,
      )
      .bind(id, businessId)
      .first<{ id: string; name: string }>();
  }
  private activeSession(businessId: string, userId: string) {
    return this.db
      .prepare(
        `SELECT cs.id,cs.location_id AS locationId,l.name AS locationName,cs.opening_amount_cents AS openingAmountCents,cs.opened_at AS openedAt FROM cash_sessions cs JOIN locations l ON l.id=cs.location_id AND l.business_id=cs.business_id WHERE cs.business_id=? AND cs.seller_id=? AND cs.status='open' AND cs.deleted_at IS NULL AND l.type='point_of_sale' AND l.is_active=1 AND l.deleted_at IS NULL ORDER BY cs.opened_at DESC LIMIT 1`,
      )
      .bind(businessId, userId)
      .first<ActiveSession>();
  }
  async state(businessId: string, userId: string) {
    const [locationResult, categoryResult] = await Promise.all([
      this.db
        .prepare(
          `SELECT id,name FROM locations WHERE business_id=? AND type='point_of_sale' AND is_active=1 AND deleted_at IS NULL ORDER BY name`,
        )
        .bind(businessId)
        .all(),
      this.db
        .prepare(
          `SELECT id,name,COALESCE(icon,'🛒') AS icon FROM categories
           WHERE business_id=? AND deleted_at IS NULL ORDER BY name`,
        )
        .bind(businessId)
        .all(),
    ]);
    const locations = locationResult.results;
    const categories = categoryResult.results;
    const active = await this.activeSession(businessId, userId);
    let session:
      | (ActiveSession & {
          expectedCashAmountCents: number;
          totalOrders: number;
          totalItems: number;
          cashOrders: number;
          cardOrders: number;
          cashSalesCents: number;
          cardSalesCents: number;
          cashRefundsCents: number;
          cardRefundsCents: number;
        })
      | null = null;
    let products: unknown[] = [];
    if (active) {
      const summary = await this.db
        .prepare(
          `SELECT COUNT(*) AS totalOrders,
          COALESCE(SUM((SELECT COALESCE(SUM(si.quantity),0) FROM sale_items si WHERE si.sale_id=s.id AND si.deleted_at IS NULL)),0) AS totalItems,
          COALESCE(SUM(CASE WHEN s.payment_method='cash' THEN 1 ELSE 0 END),0) AS cashOrders,
          COALESCE(SUM(CASE WHEN s.payment_method='card' THEN 1 ELSE 0 END),0) AS cardOrders,
          COALESCE(SUM(CASE WHEN s.payment_method='cash' THEN s.total_cents ELSE 0 END),0) AS cashSalesCents,
          COALESCE(SUM(CASE WHEN s.payment_method='card' THEN s.total_cents ELSE 0 END),0) AS cardSalesCents,
          COALESCE(SUM(CASE WHEN s.payment_method='cash' AND r.id IS NOT NULL THEN s.total_cents ELSE 0 END),0) AS cashRefundsCents,
          COALESCE(SUM(CASE WHEN s.payment_method='card' AND r.id IS NOT NULL THEN s.total_cents ELSE 0 END),0) AS cardRefundsCents
          FROM sales s LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL
          WHERE s.cash_session_id=? AND s.deleted_at IS NULL`,
        )
        .bind(active.id)
        .first<Record<string, number>>();
      session = {
        ...active,
        expectedCashAmountCents:
          Number(active.openingAmountCents) +
          Number(summary?.cashSalesCents ?? 0) -
          Number(summary?.cashRefundsCents ?? 0),
        totalOrders: Number(summary?.totalOrders ?? 0),
        totalItems: Number(summary?.totalItems ?? 0),
        cashOrders: Number(summary?.cashOrders ?? 0),
        cardOrders: Number(summary?.cardOrders ?? 0),
        cashSalesCents: Number(summary?.cashSalesCents ?? 0),
        cardSalesCents: Number(summary?.cardSalesCents ?? 0),
        cashRefundsCents: Number(summary?.cashRefundsCents ?? 0),
        cardRefundsCents: Number(summary?.cardRefundsCents ?? 0),
      };
      products = (
        await this.db
          .prepare(
            `SELECT p.id,p.name,p.image_id AS imageId,p.category_id AS categoryId,
              c.name AS categoryName,COALESCE(c.icon,'🛒') AS categoryIcon,COALESCE(SUM(bs.quantity),0) AS stock,
        COALESCE((SELECT b2.cash_price_cents FROM inventory_batches b2 JOIN inventory_batch_stocks bs2 ON bs2.batch_id=b2.id WHERE b2.business_id=p.business_id AND b2.product_id=p.id AND bs2.location_id=? AND bs2.quantity>0 AND b2.deleted_at IS NULL ORDER BY b2.received_at,b2.id LIMIT 1),0) AS cashPriceCents,
        COALESCE((SELECT b2.card_price_cents FROM inventory_batches b2 JOIN inventory_batch_stocks bs2 ON bs2.batch_id=b2.id WHERE b2.business_id=p.business_id AND b2.product_id=p.id AND bs2.location_id=? AND bs2.quantity>0 AND b2.deleted_at IS NULL ORDER BY b2.received_at,b2.id LIMIT 1),0) AS cardPriceCents
        FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN inventory_batches b ON b.product_id=p.id AND b.business_id=p.business_id AND b.deleted_at IS NULL LEFT JOIN inventory_batch_stocks bs ON bs.batch_id=b.id AND bs.location_id=?
        WHERE p.business_id=? AND p.deleted_at IS NULL AND p.is_active=1 GROUP BY p.id ORDER BY p.name`,
          )
          .bind(
            active.locationId,
            active.locationId,
            active.locationId,
            businessId,
          )
          .all()
      ).results;
    }
    return { locations, categories, session, products };
  }
  async open(
    businessId: string,
    userId: string,
    locationId: string,
    openingAmountCents: number,
  ) {
    const location = await this.location(businessId, locationId);
    if (!location) throw new Error("POS_LOCATION_NOT_FOUND");
    if (await this.activeSession(businessId, userId))
      throw new Error("SESSION_ALREADY_OPEN");
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO cash_sessions (id,business_id,seller_id,opening_amount_cents,expected_cash_amount_cents,status,opened_at,location_id) VALUES (?,?,?,?,?,'open',?,?)`,
      )
      .bind(
        id,
        businessId,
        userId,
        openingAmountCents,
        openingAmountCents,
        now,
        location.id,
      )
      .run();
    return {
      id,
      locationId: location.id,
      locationName: location.name,
      openingAmountCents,
      expectedCashAmountCents: openingAmountCents,
      openedAt: now,
    };
  }
  async sale(input: SaleInput) {
    const existing = await this.db
      .prepare(
        `SELECT id,total_cents AS totalCents FROM sales WHERE business_id=? AND client_operation_id=?`,
      )
      .bind(input.businessId, input.operationId)
      .first<{ id: string; totalCents: number }>();
    if (existing) return existing;
    const session = await this.activeSession(input.businessId, input.userId);
    if (!session) throw new Error("SESSION_REQUIRED");
    const createdAt = Date.parse(input.createdAt);
    if (
      createdAt < Date.parse(session.openedAt) ||
      createdAt > Date.now() + 5 * 60 * 1000 ||
      Date.now() - createdAt > 65 * 60 * 1000
    )
      throw new Error("OFFLINE_PERIOD_EXPIRED");
    const saleId = crypto.randomUUID(),
      statements: D1PreparedStatement[] = [];
    let totalCents = 0;
    const normalized = new Map<string, number>();
    for (const item of input.items)
      normalized.set(
        item.productId,
        (normalized.get(item.productId) ?? 0) + item.quantity,
      );
    for (const [productId, requested] of normalized) {
      const product = await this.db
        .prepare(
          `SELECT id,name FROM products WHERE id=? AND business_id=? AND is_active=1 AND deleted_at IS NULL`,
        )
        .bind(productId, input.businessId)
        .first<{ id: string; name: string }>();
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      const batches = await this.db
        .prepare(
          `SELECT b.id,b.cash_price_cents AS cashPriceCents,b.card_price_cents AS cardPriceCents,bs.quantity FROM inventory_batches b JOIN inventory_batch_stocks bs ON bs.batch_id=b.id WHERE b.business_id=? AND b.product_id=? AND bs.location_id=? AND bs.quantity>0 AND b.deleted_at IS NULL ORDER BY b.received_at,b.id`,
        )
        .bind(input.businessId, productId, session.locationId)
        .all<{
          id: string;
          cashPriceCents: number;
          cardPriceCents: number;
          quantity: number;
        }>();
      const first = batches.results[0];
      if (!first) throw new Error("INSUFFICIENT_STOCK");
      const unitPriceCents = Number(
        input.paymentMethod === "cash"
          ? first.cashPriceCents
          : first.cardPriceCents,
      );
      let remaining = requested;
      for (const batch of batches.results) {
        if (remaining <= 0) break;
        const quantity = Math.min(remaining, Number(batch.quantity));
        statements.push(
          this.db
            .prepare(
              `UPDATE inventory_batch_stocks SET quantity=quantity-?,updated_at=datetime('now') WHERE business_id=? AND batch_id=? AND location_id=? AND quantity>=?`,
            )
            .bind(
              quantity,
              input.businessId,
              batch.id,
              session.locationId,
              quantity,
            ),
          this.db
            .prepare(
              `INSERT INTO inventory_movements (id,business_id,product_id,batch_id,source_location_id,sale_id,movement_type,quantity,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,'sale',?,?,?)`,
            )
            .bind(
              crypto.randomUUID(),
              input.businessId,
              productId,
              batch.id,
              session.locationId,
              saleId,
              quantity,
              input.userId,
              input.createdAt,
            ),
        );
        remaining -= quantity;
      }
      if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
      const itemTotal = Math.round(unitPriceCents * requested);
      totalCents += itemTotal;
      statements.push(
        this.db
          .prepare(
            `INSERT INTO sale_items (id,business_id,sale_id,product_id,product_name,batch_id,quantity,unit_price_cents,total_cents,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            input.businessId,
            saleId,
            productId,
            product.name,
            first.id,
            requested,
            unitPriceCents,
            itemTotal,
            input.createdAt,
          ),
      );
    }
    if (totalCents !== input.expectedTotalCents)
      throw new Error("PRICE_CHANGED");
    statements.unshift(
      this.db
        .prepare(
          `INSERT INTO sales (id,business_id,cash_session_id,seller_id,payment_method,total_cents,location_id,client_operation_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          saleId,
          input.businessId,
          session.id,
          input.userId,
          input.paymentMethod,
          totalCents,
          session.locationId,
          input.operationId,
          input.createdAt,
        ),
    );
    await this.db.batch(statements);
    return { id: saleId, totalCents };
  }
  async orders(businessId: string, userId: string) {
    const session = await this.activeSession(businessId, userId);
    if (!session) throw new Error("SESSION_REQUIRED");
    const result = await this.db
      .prepare(
        `SELECT s.id,s.payment_method AS paymentMethod,s.total_cents AS totalCents,s.created_at AS createdAt,r.id AS refundId,r.notes AS refundNotes,
      COALESCE((SELECT json_group_array(json_object('id',x.id,'productName',x.product_name,'quantity',x.quantity,'unitPriceCents',x.unit_price_cents,'totalCents',x.total_cents)) FROM (SELECT si.* FROM sale_items si WHERE si.sale_id=s.id AND si.deleted_at IS NULL ORDER BY si.created_at,si.id) x),'[]') AS items
      FROM sales s LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL WHERE s.business_id=? AND s.cash_session_id=? AND s.deleted_at IS NULL ORDER BY s.created_at DESC,s.id DESC`,
      )
      .bind(businessId, session.id)
      .all<Record<string, unknown>>();
    return result.results.map((row) => ({
      ...row,
      items: JSON.parse(String(row.items ?? "[]")),
    }));
  }
  async refund(
    businessId: string,
    userId: string,
    saleId: string,
    notes?: string,
  ) {
    const session = await this.activeSession(businessId, userId);
    if (!session) throw new Error("SESSION_REQUIRED");
    const sale = await this.db
      .prepare(
        `SELECT s.id,s.payment_method AS paymentMethod,s.total_cents AS totalCents FROM sales s WHERE s.id=? AND s.business_id=? AND s.cash_session_id=? AND s.deleted_at IS NULL`,
      )
      .bind(saleId, businessId, session.id)
      .first();
    if (!sale) throw new Error("SALE_NOT_FOUND");
    if (
      await this.db
        .prepare(
          `SELECT id FROM sale_refunds WHERE business_id=? AND sale_id=? AND deleted_at IS NULL`,
        )
        .bind(businessId, saleId)
        .first()
    )
      throw new Error("SALE_ALREADY_REFUNDED");
    const allocations = await this.db
      .prepare(
        `SELECT product_id AS productId,batch_id AS batchId,quantity FROM inventory_movements WHERE business_id=? AND sale_id=? AND movement_type='sale' AND deleted_at IS NULL ORDER BY created_at,id`,
      )
      .bind(businessId, saleId)
      .all<{ productId: string; batchId: string; quantity: number }>();
    if (!allocations.results.length)
      throw new Error("SALE_ALLOCATIONS_NOT_FOUND");
    const refundId = crypto.randomUUID(),
      statements: D1PreparedStatement[] = [
        this.db
          .prepare(
            `INSERT INTO sale_refunds (id,business_id,sale_id,created_by_user_id,notes) VALUES (?,?,?,?,NULLIF(?,''))`,
          )
          .bind(refundId, businessId, saleId, userId, notes ?? ""),
      ];
    for (const row of allocations.results)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO inventory_batch_stocks (business_id,batch_id,location_id,quantity) VALUES (?,?,?,?) ON CONFLICT(batch_id,location_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=datetime('now')`,
          )
          .bind(businessId, row.batchId, session.locationId, row.quantity),
        this.db
          .prepare(
            `INSERT INTO inventory_movements (id,business_id,product_id,batch_id,destination_location_id,sale_id,sale_refund_id,movement_type,quantity,notes,created_by_user_id) VALUES (?,?,?,?,?,?,?,'customerReturn',?,?,?)`,
          )
          .bind(
            crypto.randomUUID(),
            businessId,
            row.productId,
            row.batchId,
            session.locationId,
            saleId,
            refundId,
            row.quantity,
            notes ?? "Reintegro de venta",
            userId,
          ),
      );
    statements.push(
      this.db
        .prepare(
          `INSERT INTO audit_logs (id,business_id,entity_type,entity_id,action,description,metadata,created_by_user_id) VALUES (?,?,'saleRefund',?,'refund','Reintegro de venta',?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          businessId,
          refundId,
          JSON.stringify({ saleId }),
          userId,
        ),
    );
    await this.db.batch(statements);
    return { id: refundId };
  }
  async close(
    businessId: string,
    userId: string,
    countedCashAmountCents: number,
  ) {
    const session = await this.activeSession(businessId, userId);
    if (!session) throw new Error("SESSION_REQUIRED");
    const totals = await this.db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN s.payment_method='cash' AND r.id IS NULL THEN s.total_cents ELSE 0 END),0) cash,COALESCE(SUM(CASE WHEN s.payment_method='card' AND r.id IS NULL THEN s.total_cents ELSE 0 END),0) card FROM sales s LEFT JOIN sale_refunds r ON r.sale_id=s.id AND r.deleted_at IS NULL WHERE s.cash_session_id=? AND s.deleted_at IS NULL`,
      )
      .bind(session.id)
      .first<{ cash: number; card: number }>();
    const cash = Number(totals?.cash ?? 0),
      card = Number(totals?.card ?? 0),
      expected = Number(session.openingAmountCents) + cash,
      now = new Date().toISOString(),
      statements = [
        this.db
          .prepare(
            `UPDATE cash_sessions SET expected_cash_amount_cents=?,counted_cash_amount_cents=?,difference_cents=?,status='closed',closed_at=?,updated_at=datetime('now') WHERE id=? AND business_id=? AND status='open'`,
          )
          .bind(
            expected,
            countedCashAmountCents,
            countedCashAmountCents - expected,
            now,
            session.id,
            businessId,
          ),
      ];
    if (cash > 0)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO financial_movements (id,business_id,type,money_location,amount_cents,description,movement_date,related_entity_type,related_entity_id,created_by_user_id) VALUES (?,?,'sessionClose','cashDeposit',?,'Cierre de sesión en efectivo',?,'cashSession',?,?)`,
          )
          .bind(crypto.randomUUID(), businessId, cash, now, session.id, userId),
      );
    if (card > 0)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO financial_movements (id,business_id,type,money_location,amount_cents,description,movement_date,related_entity_type,related_entity_id,created_by_user_id) VALUES (?,?,'sessionClose','bankAccount',?,'Cierre de sesión en tarjeta',?,'cashSession',?,?)`,
          )
          .bind(crypto.randomUUID(), businessId, card, now, session.id, userId),
      );
    await this.db.batch(statements);
    return {
      expectedCashAmountCents: expected,
      differenceCents: countedCashAmountCents - expected,
    };
  }
}
