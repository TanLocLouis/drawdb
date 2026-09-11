import assert from "node:assert/strict";
import test from "node:test";
import NodeSQLParser from "node-sql-parser";
import { DB } from "../../data/constants.js";
import { normalizeSQLForParser } from "./normalize.js";

const { Parser } = NodeSQLParser;

test("quotes a MariaDB status column for parser compatibility", () => {
  const sql = `CREATE TABLE subscriptions (
    status ENUM('pending','paid','payment_failed') NOT NULL DEFAULT 'pending',
    description VARCHAR(100) COMMENT 'status ENUM is text here'
  );`;
  const normalized = normalizeSQLForParser(sql, DB.MARIADB);

  assert.match(normalized, /`status` ENUM/);
  assert.match(normalized, /COMMENT 'status ENUM is text here'/);
  assert.doesNotThrow(() =>
    new Parser().astify(normalized, { database: DB.MARIADB }),
  );
});

test("leaves SQL for other dialects unchanged", () => {
  const sql = "CREATE TABLE example (status VARCHAR(20));";
  assert.equal(normalizeSQLForParser(sql, DB.MYSQL), sql);
});
