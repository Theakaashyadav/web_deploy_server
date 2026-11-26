import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import fs from 'node:fs';

export const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
fs.mkdirSync(dataDirectory, { recursive: true });
process.env.DATABASE_URL ||= `file:${path.join(dataDirectory, 'deployhub.db').replace(/\\/g, '/')}`;
export const db = new PrismaClient();
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v));
}
