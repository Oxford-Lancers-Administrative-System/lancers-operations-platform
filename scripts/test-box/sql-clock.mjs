// This expression is installed only in the leased test database. Without a
// transaction-local test time it has exactly the original wall-clock behavior.
export const SQL_TEST_NOW =
  "coalesce(nullif(current_setting('lancers_test.clock', true), '')::timestamptz, pg_catalog.now())";

/** Replace SQL clock expressions, preserving strings, identifiers and comments. */
export function clockSql(sql) {
  let output = "";
  let i = 0;
  while (i < sql.length) {
    const start = i;
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++];
      const escaped =
        quote === "'" && /[eE]/.test(sql[start - 1] ?? "") && !/[\w$]/.test(sql[start - 2] ?? "");
      while (i < sql.length) {
        if (escaped && sql[i] === "\\") i += 2;
        else if (sql[i++] === quote) {
          if (sql[i] === quote) i++;
          else break;
        }
      }
    } else if (sql[i] === "$" && /^(\$[A-Za-z_][\w]*\$|\$\$)/.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^(\$[A-Za-z_][\w]*\$|\$\$)/)[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
    } else if (/[A-Za-z_]/.test(sql[i])) {
      const match = sql.slice(i).match(/^[A-Za-z_][\w$]*/)[0];
      const name = match.toLowerCase();
      i += match.length;
      // Qualified application identifiers must not be mistaken for built-ins.
      if (sql.slice(0, start).trimEnd().endsWith(".")) {
        output += sql.slice(start, i);
        continue;
      }
      if (
        ["now", "transaction_timestamp", "statement_timestamp", "clock_timestamp"].includes(name)
      ) {
        const call = sql.slice(i).match(/^\s*\(\s*\)/);
        if (call) {
          i += call[0].length;
          output += `(${SQL_TEST_NOW})`;
          continue;
        }
      }
      if (["current_timestamp", "current_date", "localtimestamp"].includes(name)) {
        const precision = sql.slice(i).match(/^\s*\(\s*[0-6]\s*\)/);
        if (precision && name !== "current_date") i += precision[0].length;
        output +=
          name === "current_date"
            ? `(${SQL_TEST_NOW})::date`
            : name === "localtimestamp"
              ? `(${SQL_TEST_NOW})::timestamp`
              : `(${SQL_TEST_NOW})`;
        continue;
      }
    } else i++;
    output += sql.slice(start, i);
  }
  return output;
}
