// Tiny JSON-file backed data store. Zero native deps so it runs anywhere Node does.
// Logical schema (see README): meta, golfers{}, teams[], prizes[].
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', 'data');
export const DB_PATH = join(DATA_DIR, 'pool.json');

let state = null;

export function emptyState() {
  return { meta: {}, golfers: {}, teams: [], prizes: [] };
}

export function load() {
  if (state) return state;
  if (existsSync(DB_PATH)) {
    state = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  } else {
    state = emptyState();
  }
  return state;
}

export function save(next) {
  if (next) state = next;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
  return state;
}

export function setState(next) {
  state = next;
  return state;
}

export function isEmpty() {
  const s = load();
  return !s.teams || s.teams.length === 0;
}
