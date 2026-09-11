import { DB } from "../../data/constants.js";

const MARIADB_COLUMN_TYPES =
  /^(\s*)status(\s+)(?=(?:bigint|binary|bit|boolean|char|date|datetime|decimal|double|enum|float|geometry|int|integer|json|longtext|mediumint|numeric|set|smallint|text|time|timestamp|tinyint|uuid|varbinary|varchar|vector|year)\b)/gim;

export function normalizeSQLForParser(sql, database) {
  if (database !== DB.MARIADB) return sql;

  // node-sql-parser treats STATUS as a MariaDB keyword even when it appears in
  // a valid column-definition position. Quoting only that identifier position
  // preserves the SQL meaning and avoids touching comments or string values.
  return sql.replace(MARIADB_COLUMN_TYPES, "$1`status`$2");
}
