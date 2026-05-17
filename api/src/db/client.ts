import { SQL } from 'bun';
import { requireDatabaseUrl } from '../config';

let sql: any;

export function db() {
  if (!sql) {
    sql = new SQL(requireDatabaseUrl());
  }
  return sql;
}

export async function one<T>(queryResult: Promise<T[]>): Promise<T | null> {
  const rows = await queryResult;
  return rows[0] || null;
}

