import { it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
it("preserves the existing connection, encrypted tokens, sync cursor and sales when adding multiple accounts", async () => {
  const db = createClient({ url: "file::memory:" });
  try {
    for (const migration of ["001_initial", "008_mercado_livre", "009_ml_dashboard", "010_ml_margins", "011_ml_auto_sync", "012_ml_gross_refunds"]) await require(`../../src/db/migrations/${migration}.js`).up(db);
    await db.batch([
      "INSERT INTO users(username,created_at,updated_at) VALUES ('legacy','v1','v1')",
      "INSERT INTO platforms(user_id,platform_key,name,icon,color,created_at,updated_at) VALUES ('legacy','ml','ML','ML','#ffe600','v1','v1')",
      "INSERT INTO sales(user_id,platform_id,month,date,amount,orders_count,created_at,updated_at) VALUES ('legacy',1,'2026-Outubro','01/10',100,2,'v1','v1')",
      "INSERT INTO ml_connections(user_id,seller_id,nickname,tokens,expires_at,generation) VALUES ('legacy','123','Loja','encrypted',99999,'generation')",
      "INSERT INTO ml_auto_sync(user_id,seller_id,platform_key,enabled,from_date,to_date,next_offset,last_success_at) VALUES ('legacy','123','ml',1,'2026-10-01','2026-10-20',50,'last-success')",
      "INSERT INTO ml_records(user_id,seller_id,kind,resource_id,date_created,payload,synced_at) VALUES ('legacy','123','orders','1','2026-10-01','{}','v1')"
    ], "write");
    const before = {};
    for (const table of ["ml_connections", "ml_auto_sync", "ml_records", "sales"]) before[table] = (await db.execute(`SELECT * FROM ${table}`)).rows;
    await require("../../src/db/migrations/013_ml_multiple_accounts.js").up(db);
    for (const table of Object.keys(before)) expect((await db.execute(`SELECT * FROM ${table}`)).rows).toEqual(before[table]);
    await db.execute("INSERT INTO ml_connections(user_id,seller_id,nickname,tokens,expires_at,generation) VALUES ('legacy','456','Segunda','encrypted-2',99999,'generation-2')");
    expect((await db.execute("SELECT * FROM ml_connections")).rows).toHaveLength(2);
  } finally { db.close(); }
});
