import { hashPassword } from "../auth/password";

export type UserInput = {
  username: string;
  displayName: string;
  role: "manager" | "seller";
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
          `SELECT id,username,display_name AS displayName,role,is_active AS isActive,
            created_at AS createdAt,updated_at AS updatedAt
          FROM users WHERE business_id=? AND
            (?='%%' OR username LIKE ? COLLATE NOCASE OR display_name LIKE ? COLLATE NOCASE)
          ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,display_name`,
        )
        .bind(businessId, term, term, term)
        .all()
    ).results;
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
    await this.db
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
        input.role,
      )
      .run();
    return id;
  }

  async update(businessId: string, id: string, input: UserInput) {
    const current = await this.db
      .prepare(`SELECT role FROM users WHERE id=? AND business_id=?`)
      .bind(id, businessId)
      .first<{ role: string }>();
    if (!current) throw new Error("USER_NOT_FOUND");
    if (current.role === "owner") throw new Error("OWNER_PROTECTED");
    if (await this.usernameExists(businessId, input.username, id))
      throw new Error("USERNAME_EXISTS");
    if (input.password) {
      const password = await hashPassword(input.password);
      await this.db
        .prepare(
          `UPDATE users SET username=?,display_name=?,role=?,is_active=?,password_hash=?,password_salt=?,updated_at=datetime('now') WHERE id=? AND business_id=?`,
        )
        .bind(
          input.username,
          input.displayName,
          input.role,
          input.isActive === false ? 0 : 1,
          password.hash,
          password.salt,
          id,
          businessId,
        )
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE users SET username=?,display_name=?,role=?,is_active=?,updated_at=datetime('now') WHERE id=? AND business_id=?`,
        )
        .bind(
          input.username,
          input.displayName,
          input.role,
          input.isActive === false ? 0 : 1,
          id,
          businessId,
        )
        .run();
    }
  }
}
