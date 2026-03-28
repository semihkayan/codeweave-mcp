export function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
