export type BusinessSettingsInput = {
  name: string;
  currency: string;
  salesTaxPercentage: number;
};

export class BusinessRepository {
  constructor(private readonly db: D1Database) {}

  get(businessId: string) {
    return this.db
      .prepare(
        `SELECT id,name,currency,sales_tax_percentage AS salesTaxPercentage,
          created_at AS createdAt,updated_at AS updatedAt
        FROM businesses WHERE id=? AND is_active=1`,
      )
      .bind(businessId)
      .first();
  }

  async update(businessId: string, input: BusinessSettingsInput) {
    const result = await this.db
      .prepare(
        `UPDATE businesses SET name=?,currency=?,sales_tax_percentage=?,
          updated_at=datetime('now') WHERE id=? AND is_active=1`,
      )
      .bind(input.name, input.currency, input.salesTaxPercentage, businessId)
      .run();
    if (Number(result.meta.changes) <= 0) return false;
    const active = await this.db
      .prepare(
        `SELECT currency_code AS currencyCode FROM business_currencies WHERE business_id=? AND is_active=1`,
      )
      .bind(businessId)
      .all<{ currencyCode: string }>();
    await new MoneyRepository(this.db).configureCurrencies(businessId, [
      ...active.results.map((row) => row.currencyCode),
      input.currency,
    ]);
    return true;
  }
}
import { MoneyRepository } from "./moneyRepository";
