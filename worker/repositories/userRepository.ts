import { hashPassword } from "../auth/password";

export type UserInput = {
  username: string;
  displayName: string;
  role: "manager" | "seller" | "investor";
  password?: string;
  isActive?: boolean;
};

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  async list(businessId: string, search = "") {
    const term = `%${search.trim()}%`;
    return (
      await this.db
        .prepare(
          `SELECT users.id,users.username,users.display_name AS displayName,
            CASE WHEN ir.user_id IS NOT NULL THEN 'investor' ELSE users.role END AS role,
            users.is_active AS isActive,
            (SELECT a.investor_id FROM user_investor_access a WHERE a.user_id=users.id LIMIT 1) AS investorId,
            (SELECT i.name FROM user_investor_access a JOIN investors i ON i.id=a.investor_id WHERE a.user_id=users.id LIMIT 1) AS investorName,
            users.created_at AS createdAt,users.updated_at AS updatedAt
          FROM users LEFT JOIN investor_user_roles ir ON ir.user_id=users.id
          WHERE users.business_id=? AND
            (?='%%' OR users.username LIKE ? COLLATE NOCASE OR users.display_name LIKE ? COLLATE NOCASE)
          ORDER BY CASE WHEN users.role='owner' THEN 0 WHEN users.role='manager' THEN 1 ELSE 2 END,users.display_name`,
        )
        .bind(businessId, term, term, term)
        .all()
    ).results;
  }

  async setInvestorAccess(
    businessId: string,
    userId: string,
    investorId: string | null,
  ) {
    const user = await this.db
      .prepare(`SELECT id FROM users WHERE id=? AND business_id=?`)
      .bind(userId, businessId)
      .first();
    if (!user) throw new Error("USER_NOT_FOUND");
    if (investorId) {
      const investor = await this.db
        .prepare(`SELECT id FROM investors WHERE id=? AND business_id=?`)
        .bind(investorId, businessId)
        .first();
      if (!investor) throw new Error("INVESTOR_NOT_FOUND");
    }
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `DELETE FROM user_investor_access WHERE business_id=? AND user_id=?`,
        )
        .bind(businessId, userId),
    ];
    if (investorId)
      statements.push(
        this.db
          .prepare(
            `INSERT INTO user_investor_access (business_id,user_id,investor_id) VALUES (?,?,?)`,
          )
          .bind(businessId, userId, investorId),
      );
    await this.db.batch(statements);
  }

  async usernameExists(
    businessId: string,
    username: string,
    exceptId?: string,
  ) {
    return Boolean(
      await this.db
        .prepare(
          `SELECT id FROM users WHERE business_id=? AND username=? COLLATE NOCASE AND (? IS NULL OR id<>?)`,
        )
        .bind(businessId, username, exceptId ?? null, exceptId ?? null)
        .first(),
    );
  }

  async create(businessId: string, input: UserInput & { password: string }) {
    if (await this.usernameExists(businessId, input.username))
      throw new Error("USERNAME_EXISTS");
    const id = crypto.randomUUID(),
      password = await hashPassword(input.password);
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO users (id,business_id,username,display_name,password_hash,password_salt,role,is_active)
           VALUES (?,?,?,?,?,?,?,1)`,
        )
        .bind(
          id,
          businessId,
          input.username,
          input.displayName,
          password.hash,
          password.salt,
          input.role === "investor" ? "seller" : input.role,
        ),
    ];
    if (input.role === "investor")
      statements.push(
        this.db
          .prepare(
            `INSERT INTO investor_user_roles (user_id,business_id) VALUES (?,?)`,
          )
          .bind(id, businessId),
      );
    await this.db.batch(statements);
    return id;
  }

  async update(businessId: string, id: string, input: UserInput) {
    const current = await this.db
      .prepare(
        `SELECT u.role,ir.user_id AS investorRole FROM users u LEFT JOIN investor_user_roles ir ON ir.user_id=u.id WHERE u.id=? AND u.business_id=?`,
      )
      .bind(id, businessId)
      .first<{ role: string; investorRole?: string }>();
    if (!current) throw new Error("USER_NOT_FOUND");
    if (current.role === "owner") throw new Error("OWNER_PROTECTED");
    if (await this.usernameExists(businessId, input.username, id))
      throw new Error("USERNAME_EXISTS");
    const storedRole = input.role === "investor" ? "seller" : input.role;
    const roleStatements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `DELETE FROM investor_user_roles WHERE user_id=? AND business_id=?`,
        )
        .bind(id, businessId),
    ];
    if (input.role === "investor")
      roleStatements.push(
        this.db
          .prepare(
            `INSERT INTO investor_user_roles (user_id,business_id) VALUES (?,?)`,
          )
          .bind(id, businessId),
      );
    if (input.password) {
      const password = await hashPassword(input.password);
      roleStatements.unshift(
        this.db
          .prepare(
            `UPDATE users SET username=?,display_name=?,role=?,is_active=?,password_hash=?,password_salt=?,updated_at=datetime('now') WHERE id=? AND business_id=?`,
          )
          .bind(
            input.username,
            input.displayName,
            storedRole,
            input.isActive === false ? 0 : 1,
            password.hash,
            password.salt,
            id,
            businessId,
          ),
      );
    } else {
      roleStatements.unshift(
        this.db
          .prepare(
            `UPDATE users SET username=?,display_name=?,role=?,is_active=?,updated_at=datetime('now') WHERE id=? AND business_id=?`,
          )
          .bind(
            input.username,
            input.displayName,
            storedRole,
            input.isActive === false ? 0 : 1,
            id,
            businessId,
          ),
      );
    }
    await this.db.batch(roleStatements);
  }
}
