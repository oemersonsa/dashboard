import { it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
it("migra registros existentes sem alterar vendas e preserva o período vazio selecionado", async () => {
  const db = createClient({ url: "file::memory:" });
  try {
    await require("../../src/db/migrations/001_initial.js").up(db);
    await require("../../src/db/migrations/003_goals.js").up(db);
    await db.batch([
      "INSERT INTO users (username,created_at,updated_at) VALUES ('legacy','v1','v1')",
      "INSERT INTO platforms (user_id,platform_key,name,icon,color,created_at,updated_at) VALUES ('legacy','ml','ML','ML','#123456','v1','v1')",
      "INSERT INTO sales (user_id,platform_id,month,date,amount,orders_count,created_at,updated_at) VALUES ('legacy',1,'2026-Janeiro','01/01',1234.56,2,'v1','v1')",
      "INSERT INTO returns (user_id,platform_id,month,amount,created_at,updated_at) VALUES ('legacy',1,'2026-Fevereiro',50,'v1','v1')",
      "INSERT INTO goals (user_id,month,target,created_at,updated_at) VALUES ('legacy','2026-Marco',10000,'v1','v1')",
      "INSERT INTO app_settings (user_id,current_month,updated_at) VALUES ('legacy','2026-Abril','v1')"
    ], "write");
    const before = (await db.execute("SELECT * FROM sales")).rows;
    await require("../../src/db/migrations/007_periods.js").up(db);
    expect((await db.execute("SELECT * FROM sales")).rows).toEqual(before);
    expect((await db.execute("SELECT month FROM periods ORDER BY month")).rows.map(row => row.month).sort())
      .toEqual(["2026-Janeiro", "2026-Fevereiro", "2026-Marco", "2026-Abril"].sort());
    expect((await db.execute("SELECT date FROM logged_days")).rows[0].date).toBe("01/01");
    await require("../../src/db/migrations/007_periods.js").up(db);
    expect((await db.execute("SELECT month FROM periods")).rows).toHaveLength(4);
  } finally { db.close(); }
});
