export type MonetaryComponentInput = {
  moneyAccountId: string;
  paymentMethod: "cash" | "card" | "transfer";
  currencyCode: string;
  amountMinor: number;
  exchangeRateScaled: number;
  baseAmountCents: number;
};

export class MoneyRepository {
  constructor(private readonly db: D1Database) {}

  async settings(businessId: string) {
    const [business, currencies, accounts, cashReconciliation] =
      await Promise.all([
        this.db
          .prepare(`SELECT currency FROM businesses WHERE id=?`)
          .bind(businessId)
          .first<{ currency: string }>(),
        this.db
          .prepare(
            `SELECT currency_code AS currencyCode,is_active AS isActive
           FROM business_currencies WHERE business_id=? ORDER BY currency_code`,
          )
          .bind(businessId)
          .all(),
        this.db
          .prepare(
            `SELECT id,name,account_type AS accountType,currency_code AS currencyCode,
             location_id AS locationId,is_active AS isActive,
             COALESCE((SELECT SUM(CASE WHEN mc.flow='inflow' THEN mc.amount_minor ELSE -mc.amount_minor END)
               FROM monetary_components mc WHERE mc.business_id=money_accounts.business_id AND mc.money_account_id=money_accounts.id),0) AS movementBalanceMinor
           FROM money_accounts WHERE business_id=? AND deleted_at IS NULL
           ORDER BY currency_code,account_type,name`,
          )
          .bind(businessId)
          .all(),
        this.db
          .prepare(
            `SELECT mc.currency_code AS currencyCode,mc.operation_type AS operationType,
             SUM(CASE WHEN mc.flow='inflow' THEN mc.amount_minor ELSE 0 END) AS inflowMinor,
             SUM(CASE WHEN mc.flow='outflow' THEN mc.amount_minor ELSE 0 END) AS outflowMinor,
             SUM(CASE WHEN mc.flow='inflow' THEN mc.base_amount_cents ELSE 0 END) AS inflowBaseCents,
             SUM(CASE WHEN mc.flow='outflow' THEN mc.base_amount_cents ELSE 0 END) AS outflowBaseCents
           FROM monetary_components mc
           JOIN money_accounts ma ON ma.id=mc.money_account_id
           WHERE mc.business_id=? AND ma.account_type='cashDrawer'
             AND ma.deleted_at IS NULL
           GROUP BY mc.currency_code,mc.operation_type
           ORDER BY mc.currency_code,mc.operation_type`,
          )
          .bind(businessId)
          .all(),
      ]);
    return {
      baseCurrency: business?.currency ?? "CUP",
      currencies: currencies.results,
      accounts: accounts.results,
      cashReconciliation: cashReconciliation.results,
    };
  }

  async configureCurrencies(businessId: string, currencyCodes: string[]) {
    const business = await this.db
      .prepare(`SELECT upper(currency) AS currency FROM businesses WHERE id=?`)
      .bind(businessId)
      .first<{ currency: string }>();
    if (!business) throw new Error("BUSINESS_NOT_FOUND");
    const codes = [...new Set([business.currency, ...currencyCodes])];
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `UPDATE business_currencies SET is_active=0,updated_at=datetime('now') WHERE business_id=?`,
        )
        .bind(businessId),
    ];
    for (const code of codes) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO business_currencies (business_id,currency_code,is_active)
             VALUES (?,?,1) ON CONFLICT(business_id,currency_code) DO UPDATE SET
             is_active=1,updated_at=datetime('now')`,
          )
          .bind(businessId, code),
      );
      for (const [suffix, name, type] of [
        ["cash", `Efectivo ${code}`, "cashDrawer"],
        ["bank", `Cuenta bancaria ${code}`, "bankAccount"],
      ] as const)
        statements.push(
          this.db
            .prepare(
              `INSERT OR IGNORE INTO money_accounts
               (id,business_id,name,account_type,currency_code)
               VALUES (?,?,?,?,?)`,
            )
            .bind(
              `default-${suffix}-${businessId}-${code}`,
              businessId,
              name,
              type,
              code,
            ),
        );
    }
    await this.db.batch(statements);
  }

  async validateComponents(
    businessId: string,
    components: MonetaryComponentInput[],
    expectedBaseCents: number,
  ) {
    if (!components.length) throw new Error("PAYMENTS_REQUIRED");
    if (
      components.reduce((sum, row) => sum + row.baseAmountCents, 0) !==
      expectedBaseCents
    )
      throw new Error("PAYMENT_TOTAL_MISMATCH");
    for (const row of components) {
      if (
        !Number.isSafeInteger(row.amountMinor) ||
        !Number.isSafeInteger(row.exchangeRateScaled) ||
        !Number.isSafeInteger(row.baseAmountCents) ||
        row.amountMinor <= 0 ||
        row.exchangeRateScaled <= 0 ||
        row.baseAmountCents <= 0
      )
        throw new Error("INVALID_PAYMENT");
      const account = await this.db
        .prepare(
          `SELECT id,account_type AS accountType FROM money_accounts
           WHERE id=? AND business_id=? AND currency_code=? AND is_active=1
             AND deleted_at IS NULL`,
        )
        .bind(row.moneyAccountId, businessId, row.currencyCode)
        .first<{ id: string; accountType: string }>();
      if (!account) throw new Error("MONEY_ACCOUNT_NOT_FOUND");
      const currency = await this.db
        .prepare(
          `SELECT 1 ok FROM business_currencies
           WHERE business_id=? AND currency_code=? AND is_active=1`,
        )
        .bind(businessId, row.currencyCode)
        .first();
      if (!currency) throw new Error("CURRENCY_NOT_ACCEPTED");
    }
  }

  componentStatements(
    businessId: string,
    userId: string,
    operationType:
      | "sale"
      | "saleRefund"
      | "supplierInvoice"
      | "financialMovement"
      | "currencyExchange",
    operationId: string,
    flow: "inflow" | "outflow",
    components: MonetaryComponentInput[],
    createdAt: string,
    cashSessionId?: string | null,
  ) {
    return components.map((row) =>
      this.db
        .prepare(
          `INSERT INTO monetary_components
           (id,business_id,operation_type,operation_id,cash_session_id,
            money_account_id,payment_method,flow,currency_code,amount_minor,
            exchange_rate_scaled,base_amount_cents,created_by_user_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          businessId,
          operationType,
          operationId,
          cashSessionId ?? null,
          row.moneyAccountId,
          row.paymentMethod,
          flow,
          row.currencyCode,
          row.amountMinor,
          row.exchangeRateScaled,
          row.baseAmountCents,
          userId,
          createdAt,
        ),
    );
  }

  async exchanges(businessId: string) {
    const result = await this.db
      .prepare(
        `SELECT e.id,e.exchange_rate_scaled AS exchangeRateScaled,
          e.exchange_date AS exchangeDate,e.notes,e.reversed_at AS reversedAt,
          COALESCE((SELECT json_group_array(json_object(
            'id',m.id,'flow',m.flow,'currencyCode',m.currency_code,
            'amountMinor',m.amount_minor,'baseAmountCents',m.base_amount_cents,
            'moneyAccountId',m.money_account_id,'accountName',a.name
          )) FROM monetary_components m JOIN money_accounts a ON a.id=m.money_account_id
          WHERE m.business_id=e.business_id AND m.operation_type='currencyExchange' AND m.operation_id=e.id),'[]') components
         FROM currency_exchanges e WHERE e.business_id=?
         ORDER BY e.exchange_date DESC,e.id DESC LIMIT 500`,
      )
      .bind(businessId)
      .all<Record<string, unknown>>();
    return result.results.map((row) => ({
      ...row,
      components: JSON.parse(String(row.components ?? "[]")),
    }));
  }

  async exchange(
    businessId: string,
    userId: string,
    input: {
      exchangeDate: string;
      notes?: string;
      cashSessionId?: string;
      source: MonetaryComponentInput;
      target: MonetaryComponentInput;
    },
  ) {
    if (input.source.currencyCode === input.target.currencyCode)
      throw new Error("EXCHANGE_CURRENCIES_MUST_DIFFER");
    const base = await this.db
      .prepare(`SELECT upper(currency) currency FROM businesses WHERE id=?`)
      .bind(businessId)
      .first<{ currency: string }>();
    if (
      input.source.currencyCode !== base?.currency &&
      input.target.currencyCode !== base?.currency
    )
      throw new Error("EXCHANGE_BASE_CURRENCY_REQUIRED");
    if (input.source.baseAmountCents !== input.target.baseAmountCents)
      throw new Error("EXCHANGE_TOTAL_MISMATCH");
    await this.validateComponents(
      businessId,
      [input.source],
      input.source.baseAmountCents,
    );
    await this.validateComponents(
      businessId,
      [input.target],
      input.target.baseAmountCents,
    );
    if (input.cashSessionId) {
      const available = await this.db
        .prepare(
          `SELECT cb.expected_amount_minor AS amount
           FROM cash_session_currency_balances cb JOIN cash_sessions cs ON cs.id=cb.cash_session_id
           WHERE cb.cash_session_id=? AND cb.business_id=? AND cb.currency_code=?
             AND cs.status='open' AND cs.deleted_at IS NULL`,
        )
        .bind(input.cashSessionId, businessId, input.source.currencyCode)
        .first<{ amount: number }>();
      if (!available || Number(available.amount) < input.source.amountMinor)
        throw new Error("INSUFFICIENT_CURRENCY_BALANCE");
    }
    const id = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO currency_exchanges
           (id,business_id,exchange_rate_scaled,exchange_date,notes,created_by_user_id)
           VALUES (?,?,?,?,NULLIF(?,''),?)`,
        )
        .bind(
          id,
          businessId,
          input.target.exchangeRateScaled,
          input.exchangeDate,
          input.notes ?? "",
          userId,
        ),
      ...this.componentStatements(
        businessId,
        userId,
        "currencyExchange",
        id,
        "outflow",
        [input.source],
        input.exchangeDate,
        input.cashSessionId,
      ),
      ...this.componentStatements(
        businessId,
        userId,
        "currencyExchange",
        id,
        "inflow",
        [input.target],
        input.exchangeDate,
        input.cashSessionId,
      ),
    ];
    if (input.cashSessionId) {
      statements.push(
        this.db
          .prepare(
            `UPDATE cash_session_currency_balances
             SET expected_amount_minor=expected_amount_minor-?,updated_at=datetime('now')
             WHERE cash_session_id=? AND business_id=? AND currency_code=?
               AND expected_amount_minor>=?`,
          )
          .bind(
            input.source.amountMinor,
            input.cashSessionId,
            businessId,
            input.source.currencyCode,
            input.source.amountMinor,
          ),
        this.db
          .prepare(
            `INSERT INTO cash_session_currency_balances
             (cash_session_id,business_id,currency_code,expected_amount_minor)
             VALUES (?,?,?,?) ON CONFLICT(cash_session_id,currency_code)
             DO UPDATE SET expected_amount_minor=expected_amount_minor+excluded.expected_amount_minor,
               updated_at=datetime('now')`,
          )
          .bind(
            input.cashSessionId,
            businessId,
            input.target.currencyCode,
            input.target.amountMinor,
          ),
      );
    }
    await this.db.batch(statements);
    return id;
  }
}
