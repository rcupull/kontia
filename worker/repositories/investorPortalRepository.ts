import { InvestmentRepository } from "./investmentRepository";

export class InvestorPortalRepository {
  constructor(private readonly db: D1Database) {}

  async snapshotBusiness(
    businessId: string,
    date = new Date().toISOString().slice(0, 10),
  ) {
    const summary = await new InvestmentRepository(this.db).summary(businessId);
    await this.db
      .prepare(
        `INSERT INTO investment_valuation_snapshots
         (business_id,snapshot_date,treasury_cents,inventory_cents,fixed_assets_cents,total_equity_cents,total_units_micros)
         VALUES (?,?,?,?,?,?,?) ON CONFLICT(business_id,snapshot_date) DO UPDATE SET
         treasury_cents=excluded.treasury_cents,inventory_cents=excluded.inventory_cents,
         fixed_assets_cents=excluded.fixed_assets_cents,
         total_equity_cents=excluded.total_equity_cents,total_units_micros=excluded.total_units_micros,
         updated_at=datetime('now')`,
      )
      .bind(
        businessId,
        date,
        summary.currentValuation.treasuryCents,
        summary.currentValuation.inventoryCents,
        summary.currentValuation.fixedAssetsCents,
        summary.currentValuation.totalCents,
        summary.totalUnitsMicros,
      )
      .run();
  }

  async snapshotAllBusinesses() {
    const businesses = await this.db
      .prepare(`SELECT id FROM businesses`)
      .all<{ id: string }>();
    for (const row of businesses.results) await this.snapshotBusiness(row.id);
  }

  async mine(businessId: string, userId: string) {
    const link = await this.db
      .prepare(
        `SELECT i.id,i.name FROM user_investor_access a
         JOIN investors i ON i.id=a.investor_id AND i.business_id=a.business_id
         WHERE a.business_id=? AND a.user_id=? ORDER BY a.created_at LIMIT 1`,
      )
      .bind(businessId, userId)
      .first<{ id: string; name: string }>();
    if (!link) throw new Error("INVESTOR_ACCESS_NOT_FOUND");
    await this.snapshotBusiness(businessId);
    const summary = await new InvestmentRepository(this.db).summary(businessId);
    const investor = summary.investors.find((row) => row.id === link.id);
    if (!investor) throw new Error("INVESTOR_ACCESS_NOT_FOUND");
    const [capital, sales, movements] = await Promise.all([
      this.db
        .prepare(
          `SELECT s.snapshot_date AS day,s.total_equity_cents AS businessEquityCents,
           s.total_units_micros AS totalUnitsMicros,
           COALESCE((SELECT SUM(e.units_micros)
               FROM investment_entries e WHERE e.business_id=s.business_id
                 AND e.investor_id=? AND substr(e.entry_date,1,10)<=s.snapshot_date),0)
             AS investorUnitsMicros
           FROM investment_valuation_snapshots s WHERE s.business_id=?
           ORDER BY s.snapshot_date`,
        )
        .bind(link.id, businessId)
        .all(),
      this.db
        .prepare(
          `SELECT substr(s.created_at,1,10) day,
           SUM(CASE WHEN r.id IS NULL THEN s.total_cents ELSE 0 END) salesCents
           FROM sales s LEFT JOIN sale_refunds r ON r.business_id=s.business_id
             AND r.sale_id=s.id AND r.deleted_at IS NULL
           WHERE s.business_id=? AND s.deleted_at IS NULL
             AND s.created_at>=datetime('now','-90 days')
           GROUP BY substr(s.created_at,1,10) ORDER BY day`,
        )
        .bind(businessId)
        .all(),
      this.db
        .prepare(
          `SELECT e.id,
           CASE WHEN EXISTS (SELECT 1 FROM investment_prior_liability_corrections c
             WHERE c.correction_investment_entry_id=e.id)
             THEN 'priorLiabilityCorrection' ELSE e.entry_type END AS entryType,
           e.amount_cents AS amountCents,e.entry_date AS entryDate,e.notes
           FROM investment_entries e WHERE e.business_id=? AND e.investor_id=?
           ORDER BY e.entry_date DESC LIMIT 100`,
        )
        .bind(businessId, link.id)
        .all(),
    ]);
    const totalReturned =
      investor.distributedCents + investor.withdrawnCapitalCents;
    const adjustedContributedCents =
      investor.contributedCents - investor.correctedCapitalCents;
    const accumulatedReturnCents =
      investor.currentPatrimonyCents + totalReturned - adjustedContributedCents;
    return {
      baseCurrency: summary.baseCurrency,
      investor: {
        ...investor,
        accumulatedReturnCents,
        returnBps:
          adjustedContributedCents > 0
            ? Math.round(
                (accumulatedReturnCents * 10000) / adjustedContributedCents,
              )
            : 0,
      },
      series: {
        capital: capital.results.map((row) => {
          const values = row as Record<string, unknown>;
          const totalUnits = Number(values.totalUnitsMicros ?? 0);
          return {
            day: String(values.day),
            businessEquityCents: Number(values.businessEquityCents ?? 0),
            patrimonyCents:
              totalUnits > 0
                ? Math.round(
                    (Number(values.businessEquityCents ?? 0) *
                      Number(values.investorUnitsMicros ?? 0)) /
                      totalUnits,
                  )
                : 0,
          };
        }),
        sales: sales.results,
      },
      movements: movements.results,
    };
  }
}
