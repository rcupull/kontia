/**
 * D1/SQLite stores datetime('now') as UTC but returns `YYYY-MM-DD HH:mm:ss`
 * without a timezone marker. Add the UTC marker before handing it to Date.
 */
export function parseDatabaseDateTime(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(
    value,
  )
    ? `${value.replace(" ", "T")}Z`
    : value;
  return new Date(normalized);
}

export function formatDatabaseDateTime(value: string, locale = "es") {
  return parseDatabaseDateTime(value).toLocaleString(locale);
}
