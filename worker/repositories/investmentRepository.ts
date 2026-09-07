import {
  MoneyRepository,
  type MonetaryComponentInput,
} from "./moneyRepository";

type ContributionInput = {
  investorId: string;
  amountCents: number;
  preMoneyValuationCents?: number;
  entryDate: string;
  notes?: string;
  affectsCash: boolean;
  components?: MonetaryComponentInput[];
};

export class InvestmentRepository {
  constructor(private readonly db: D1Database) {}

  async summary(businessId: string) {
    const [business, investors, entries, treasury, inventory] =
      await Promise.all([
        this.db
          .prepare(`SELECT currency FROM businesses WHERE id=?`)
          .bind(businessId)
          .first<{ currency: string }>(),
        this.db
          .prepare(
            `SELECT i.id,i.name,i.notes,i.is_active AS isActive,i.created_at AS createdAt,
           COALESCE(SUM(CASE WHEN e.entry_type IN ('openingCapital','contribution') THEN e.amount_cents ELSE 0 END),0) AS contributedCents,
           COALESCE(SUM(CASE WHEN e.entry_type='capitalWithdrawal' THEN e.amount_cents ELSE 0 END),0) AS withdrawnCapitalCents,
           COALESCE(SUM(CASE WHEN e.entry_type='profitDistribution' THEN e.amount_cents ELSE 0 END),0) AS distributedCents,
           COALESCE(SUM(e.units_micros),0) AS unitsMicros
           FROM investors i LEFT JOIN investment_entries e
             ON e.business_id=i.business_id AND e.investor_id=i.id
           WHERE i.business_id=? GROUP BY i.id ORDER BY i.created_at,i.name`,
          )
          .bind(businessId)
          .all<Record<string, unknown>>(),
        this.db
          .prepare(
            `SELECT e.id,e.batch_id AS batchId,e.entry_type AS entryType,
           e.amount_cents AS amountCents,e.units_micros AS unitsMicros,
           e.pre_money_valuation_cents AS preMoneyValuationCents,
           e.affects_cash AS affectsCash,e.entry_date AS entryDate,e.notes,
           i.id AS investorId,i.name AS investorName
           FROM investment_entries e JOIN investors i ON i.id=e.investor_id
           WHERE e.business_id=? ORDER BY e.entry_date DESC,e.created_at DESC LIMIT 500`,
          )
          .bind(businessId)
          .all(),
        this.db
          .prepare(
            `SELECT COALESCE(SUM(CASE WHEN flow='inflow' THEN base_amount_cents ELSE -base_amount_cents END),0) value
             FROM monetary_components WHERE business_id=?`,
          )
          .bind(businessId)
          .first<{ value: number }>(),
        this.db
          .prepare(
            `SELECT COALESCE(ROUND(SUM(s.quantity * b.unit_cost_cents)),0) value
             FROM inventory_batch_stocks s
             JOIN inventory_batches b ON b.id=s.batch_id AND b.business_id=s.business_id
             WHERE s.business_id=? AND s.quantity>0 AND b.deleted_at IS NULL`,
          )
          .bind(businessId)
          .first<{ value: number }>(),
      ]);
    const normalized = investors.results.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      notes: row.notes == null ? undefined : String(row.notes),
      isActive: Number(row.isActive ?? 0),
      createdAt: String(row.createdAt),
      contributedCents: Number(row.contributedCents ?? 0),
      withdrawnCapitalCents: Number(row.withdrawnCapitalCents ?? 0),
      distributedCents: Number(row.distributedCents ?? 0),
      unitsMicros: Number(row.unitsMicros ?? 0),
    }));
    const totalUnitsMicros = normalized.reduce(
      (sum, row) => sum + row.unitsMicros,
      0,
    );
    return {
      baseCurrency: business?.currency ?? "CUP",
      currentValuation: {
        treasuryCents: Number(treasury?.value ?? 0),
        inventoryCents: Number(inventory?.value ?? 0),
        totalCents:
          Number(treasury?.value ?? 0) + Number(inventory?.value ?? 0),
      },
      totalUnitsMicros,
      totalContributedCents: normalized.reduce(
        (sum, row) => sum + row.contributedCents,
        0,
      ),
      totalDistributedCents: normalized.reduce(
        (sum, row) => sum + row.distributedCents,
        0,
      ),
      investors: normalized.map((row) => ({
        ...row,
        netContributedCents: row.contributedCents - row.withdrawnCapitalCents,
        currentPatrimonyCents:
          totalUnitsMicros > 0
            ? Number(
                (BigInt(
                  Math.max(
                    0,
                    Number(treasury?.value ?? 0) +
                      Number(inventory?.value ?? 0),
                  ),
                ) *
                  BigInt(row.unitsMicros)) /
                  BigInt(totalUnitsMicros),
              )
            : 0,
        ownershipBps:
          totalUnitsMicros > 0
            ? Math.round((row.unitsMicros * 10000) / totalUnitsMicros)
            : 0,
      })),
      entries: entries.results,
    };
  }

  async createInvestor(
    businessId: string,
    input: { name: string; notes?: string },
  ) {
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO investors (id,business_id,name,notes) VALUES (?,?,?,NULLIF(?,''))`,
      )
      .bind(id, businessId, input.name, input.notes ?? "")
      .run();
    return id;
  }

  async setInvestorStatus(businessId: string, id: string, isActive: boolean) {
    const result = await this.db
      .prepare(
        `UPDATE investors SET is_active=?,updated_at=datetime('now') WHERE id=? AND business_id=?`,
      )
      .bind(isActive ? 1 : 0, id, businessId)
      .run();
    return Number(result.meta.changes) > 0;
  }

  private async totalUnits(businessId: string) {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(SUM(units_micros),0) total FROM investment_entries WHERE business_id=?`,
      )
      .bind(businessId)
      .first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async contribute(
    businessId: string,
    userId: string,
    input: ContributionInput,
  ) {
    const investor = await this.db
      .prepare(
        `SELECT name FROM investors WHERE id=? AND business_id=? AND is_active=1`,
      )
      .bind(input.investorId, businessId)
      .first<{ name: string }>();
    if (!investor) throw new Error("INVESTOR_NOT_FOUND");
    const existingUnits = await this.totalUnits(businessId);
    let unitsMicros: number;
    if (existingUnits === 0) {
      unitsMicros = input.amountCents * 1_000;
    } else {
      if (!input.preMoneyValuationCents) throw new Error("VALUATION_REQUIRED");
      unitsMicros = Number(
        (BigInt(input.amountCents) * BigInt(existingUnits)) /
          BigInt(input.preMoneyValuationCents),
      );
    }
    if (!Number.isSafeInteger(unitsMicros) || unitsMicros <= 0)
      throw new Error("INVALID_UNITS");

    const money = new MoneyRepository(this.db);
    const batchId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [];
    let financialMovementId: string | null = null;
    if (input.affectsCash) {
      const components = input.components ?? [];
      await money.validateComponents(businessId, components, input.amountCents);
      financialMovementId = crypto.randomUUID();
      statements.push(
        this.db
          .prepare(
            `INSERT INTO financial_movements
             (id,business_id,type,money_location,amount_cents,description,movement_date,notes,
              related_entity_type,related_entity_id,created_by_user_id)
             VALUES (?,?,'capitalInjection','bankAccount',?,?,?,NULLIF(?,''),'investmentContribution',?,?)`,
          )
          .bind(
            financialMovementId,
            businessId,
            input.amountCents,
            `Aporte de ${investor.name}`,
            input.entryDate,
            input.notes ?? "",
            entryId,
            userId,
          ),
        ...money.componentStatements(
          businessId,
          userId,
          "financialMovement",
          financialMovementId,
          "inflow",
          components,
          input.entryDate,
        ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO investment_entries
           (id,business_id,investor_id,batch_id,entry_type,amount_cents,units_micros,
            pre_money_valuation_cents,affects_cash,financial_movement_id,entry_date,notes,created_by_user_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          entryId,
          businessId,
          input.investorId,
          batchId,
          input.affectsCash ? "contribution" : "openingCapital",
          input.amountCents,
          unitsMicros,
          input.preMoneyValuationCents ?? null,
          input.affectsCash ? 1 : 0,
          financialMovementId,
          input.entryDate,
          input.notes ?? null,
          userId,
        ),
    );
    await this.db.batch(statements);
    return entryId;
  }

  async distribute(
    businessId: string,
    userId: string,
    input: {
      amountCents: number;
      entryDate: string;
      notes?: string;
      components: MonetaryComponentInput[];
    },
  ) {
    const summary = await this.summary(businessId);
    const owners = summary.investors.filter((row) => row.unitsMicros > 0);
    if (!summary.totalUnitsMicros || !owners.length)
      throw new Error("NO_OWNERSHIP");
    const money = new MoneyRepository(this.db);
    await money.validateComponents(
      businessId,
      input.components,
      input.amountCents,
    );
    const batchId = crypto.randomUUID();
    const movementId = crypto.randomUUID();
    const allocations = owners.map((row) => ({
      investorId: String(row.id),
      investorName: String(row.name),
      amountCents: Number(
        (BigInt(input.amountCents) * BigInt(row.unitsMicros)) /
          BigInt(summary.totalUnitsMicros),
      ),
    }));
    let remainder =
      input.amountCents - allocations.reduce((s, r) => s + r.amountCents, 0);
    for (
      let i = 0;
      remainder > 0;
      i = (i + 1) % allocations.length, remainder--
    )
      allocations[i].amountCents++;
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO financial_movements
           (id,business_id,type,money_location,amount_cents,description,movement_date,notes,
            related_entity_type,related_entity_id,created_by_user_id)
           VALUES (?,?,'ownerWithdrawal','bankAccount',?,'Distribución a inversores',?,NULLIF(?,''),'investmentDistribution',?,?)`,
        )
        .bind(
          movementId,
          businessId,
          input.amountCents,
          input.entryDate,
          input.notes ?? "",
          batchId,
          userId,
        ),
      ...money.componentStatements(
        businessId,
        userId,
        "financialMovement",
        movementId,
        "outflow",
        input.components,
        input.entryDate,
      ),
      ...allocations
        .filter((row) => row.amountCents > 0)
        .map((row) =>
          this.db
            .prepare(
              `INSERT INTO investment_entries
               (id,business_id,investor_id,batch_id,entry_type,amount_cents,units_micros,
                affects_cash,financial_movement_id,entry_date,notes,created_by_user_id)
               VALUES (?,?,?,?, 'profitDistribution',?,0,1,?,?,?,?)`,
            )
            .bind(
              crypto.randomUUID(),
              businessId,
              row.investorId,
              batchId,
              row.amountCents,
              movementId,
              input.entryDate,
              input.notes ?? null,
              userId,
            ),
        ),
    ];
    await this.db.batch(statements);
    return { batchId, allocations };
  }

  async withdrawCapital(
    businessId: string,
    userId: string,
    input: {
      investorId: string;
      amountCents: number;
      entryDate: string;
      notes?: string;
      components: MonetaryComponentInput[];
    },
  ) {
    const summary = await this.summary(businessId);
    const investor = summary.investors.find(
      (row) => row.id === input.investorId && row.isActive,
    );
    if (!investor || investor.unitsMicros <= 0)
      throw new Error("INVESTOR_NOT_FOUND");
    const valuation = summary.currentValuation.totalCents;
    if (valuation <= 0 || summary.totalUnitsMicros <= 0)
      throw new Error("INVALID_VALUATION");
    const maximumCents = Number(
      (BigInt(valuation) * BigInt(investor.unitsMicros)) /
        BigInt(summary.totalUnitsMicros),
    );
    if (input.amountCents > maximumCents)
      throw new Error("WITHDRAWAL_EXCEEDS_POSITION");
    let unitsToBurn =
      input.amountCents === maximumCents
        ? investor.unitsMicros
        : Number(
            (BigInt(input.amountCents) * BigInt(summary.totalUnitsMicros) +
              BigInt(valuation) -
              1n) /
              BigInt(valuation),
          );
    unitsToBurn = Math.min(unitsToBurn, investor.unitsMicros);
    if (!Number.isSafeInteger(unitsToBurn) || unitsToBurn <= 0)
      throw new Error("INVALID_UNITS");

    const money = new MoneyRepository(this.db);
    await money.validateComponents(
      businessId,
      input.components,
      input.amountCents,
    );
    const requestedByAccount = new Map<string, number>();
    for (const component of input.components)
      requestedByAccount.set(
        component.moneyAccountId,
        (requestedByAccount.get(component.moneyAccountId) ?? 0) +
          component.amountMinor,
      );
    for (const [accountId, requestedMinor] of requestedByAccount) {
      const balance = await this.db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN flow='inflow' THEN amount_minor ELSE -amount_minor END),0) amount
           FROM monetary_components WHERE business_id=? AND money_account_id=?`,
        )
        .bind(businessId, accountId)
        .first<{ amount: number }>();
      if (Number(balance?.amount ?? 0) < requestedMinor)
        throw new Error("INSUFFICIENT_CURRENCY_BALANCE");
    }
    const entryId = crypto.randomUUID();
    const movementId = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO financial_movements
           (id,business_id,type,money_location,amount_cents,description,movement_date,notes,
            related_entity_type,related_entity_id,created_by_user_id)
           VALUES (?,?,'ownerWithdrawal','bankAccount',?,?,?,NULLIF(?,''),'investmentCapitalWithdrawal',?,?)`,
        )
        .bind(
          movementId,
          businessId,
          input.amountCents,
          `Retiro de capital de ${investor.name}`,
          input.entryDate,
          input.notes ?? "",
          entryId,
          userId,
        ),
      ...money.componentStatements(
        businessId,
        userId,
        "financialMovement",
        movementId,
        "outflow",
        input.components,
        input.entryDate,
      ),
      this.db
        .prepare(
          `INSERT INTO investment_entries
           (id,business_id,investor_id,batch_id,entry_type,amount_cents,units_micros,
            pre_money_valuation_cents,affects_cash,financial_movement_id,entry_date,notes,created_by_user_id)
           VALUES (?,?,?,?,'capitalWithdrawal',?,?,?,1,?,?,?,?)`,
        )
        .bind(
          entryId,
          businessId,
          input.investorId,
          crypto.randomUUID(),
          input.amountCents,
          -unitsToBurn,
          valuation,
          movementId,
          input.entryDate,
          input.notes ?? null,
          userId,
        ),
    ]);
    return { id: entryId, unitsBurned: unitsToBurn, maximumCents };
  }
}
