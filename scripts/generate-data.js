// Build step: parse "Golf Pool - Open Championship 2026.xlsx" into web/public/data.json.
// This is the one-time data snapshot the static site loads at runtime (Round 1 scores,
// rosters, prizes, metadata). Live Rounds 2-4 come from ESPN in the browser.
//
//  - "Golfer Data" sheet   -> master golfer list + per-round front9/back9 to-par scores
//  - each participant tab   -> one or more stacked 6-golfer team entries
//  - "Leaderboard" sheet    -> prize payout structure
//
// Run with: npm run generate-data
import XLSXpkg from 'xlsx';
const XLSX = XLSXpkg.default || XLSXpkg;
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { TOURNAMENT } from '../web/src/lib/tournament.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Course par split comes from the shared tournament config (validated vs. ESPN).
const PAR_FRONT = TOURNAMENT.parFront;
const PAR_BACK = TOURNAMENT.parBack;
const DATA_SHEETS = new Set(['Golfer Data', 'Leaderboard', 'Golfer Frequency']);

const SPECIAL = { ø: 'o', æ: 'ae', œ: 'oe', ð: 'd', þ: 'th', ł: 'l', ß: 'ss', đ: 'd', ħ: 'h', ı: 'i' };

/** Accent-fold + lowercase + strip non-alphanumerics. "Ludvig Åberg" -> "ludvigaberg". */
function fold(name) {
  if (name == null) return '';
  return String(name)
    .toLowerCase()
    .replace(/[øæœðþłßđħı]/g, (ch) => SPECIAL[ch] || ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** URL/id-safe slug. "J.J. Spaun" -> "jj-spaun". */
function slug(name) {
  if (name == null) return '';
  return String(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function xlsxPath() {
  const envPath = process.env.POOL_XLSX;
  if (envPath && existsSync(envPath)) return envPath;
  return join(ROOT, 'Golf Pool - Open Championship 2026.xlsx');
}

function sheetGrid(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseGolferData(grid) {
  // Row 0: round group header, Row 1: column header, Row 2+: golfers.
  // Cols: 0 name, 2 cost, 3 r1f9, 4 r1b9, 5 r2f9, 6 r2b9, 7 r3f9, 8 r3b9, 9 r4f9, 10 r4b9
  const golfers = {};
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] || [];
    const name = row[0];
    if (name == null || String(name).trim() === '') continue;
    const id = slug(name);
    const cost = num(row[2]);
    const scores = {};
    const cols = { 1: [3, 4], 2: [5, 6], 3: [7, 8], 4: [9, 10] };
    for (const round of [1, 2, 3, 4]) {
      const [fc, bc] = cols[round];
      const f9 = num(row[fc]);
      const b9 = num(row[bc]);
      if (f9 !== null || b9 !== null) {
        scores[round] = { f9, b9, source: 'excel', manual: false };
      }
    }
    golfers[id] = {
      id,
      name: String(name).trim(),
      salary: cost,
      scores,
      cut: 'active',
      position: null,
      thru: null,
      today: null,
      totalToPar: null,
    };
  }
  return golfers;
}

function parseParticipantSheet(sheetName, grid, golferIndex) {
  const owner = grid[0] && grid[0][0] ? String(grid[0][0]).trim() : sheetName;
  const blockRows = [];
  for (let r = 0; r < grid.length; r++) {
    if (grid[r] && grid[r][2] === 'Round 1') blockRows.push(r);
  }
  const teams = [];
  const multi = blockRows.length > 1;
  blockRows.forEach((R, i) => {
    const entryNum = i + 1;
    const roster = [];
    const rosterNames = [];
    for (let k = R + 2; k <= R + 7; k++) {
      const row = grid[k] || [];
      const gname = row[0];
      if (gname == null || String(gname).trim() === '') continue;
      rosterNames.push(String(gname).trim());
      const gid = golferIndex.get(fold(gname));
      if (gid) roster.push(gid);
      else roster.push({ unmatched: String(gname).trim() });
    }
    const totalSalary = num((grid[R + 8] || [])[1]);
    teams.push({
      id: `${slug(owner)}-${entryNum}`,
      owner,
      entryNum,
      displayName: multi ? `${owner} #${entryNum}` : owner,
      roster,
      rosterNames,
      totalSalary,
      paid: true,
      status: 'active',
    });
  });
  return teams;
}

function parsePrizes(grid) {
  const prizes = [];
  let pot = null;
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] || [];
    const rank = num(row[0]);
    const prize = num(row[3]);
    if (rank !== null && prize !== null) prizes.push({ rank, amount: prize });
    const maybePot = num(row[6]);
    if (maybePot && maybePot > (pot || 0)) pot = maybePot;
  }
  return { prizes, pot };
}

function importWorkbook(path) {
  if (!existsSync(path)) throw new Error(`Workbook not found: ${path}`);
  const wb = XLSX.readFile(path, { cellFormula: false, cellText: false });

  const golferDataWs = wb.Sheets['Golfer Data'];
  if (!golferDataWs) throw new Error('Missing "Golfer Data" sheet');
  const golfers = parseGolferData(sheetGrid(golferDataWs));

  const golferIndex = new Map();
  for (const g of Object.values(golfers)) golferIndex.set(fold(g.name), g.id);

  const teams = [];
  const unmatchedNames = new Set();
  for (const name of wb.SheetNames) {
    if (DATA_SHEETS.has(name)) continue;
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const grid = sheetGrid(ws);
    for (const team of parseParticipantSheet(name, grid, golferIndex)) {
      for (const slot of team.roster) {
        if (slot && typeof slot === 'object' && slot.unmatched) unmatchedNames.add(slot.unmatched);
      }
      teams.push(team);
    }
  }

  let prizeInfo = { prizes: [], pot: null };
  if (wb.Sheets['Leaderboard']) prizeInfo = parsePrizes(sheetGrid(wb.Sheets['Leaderboard']));

  const ownership = {};
  for (const t of teams) {
    for (const slot of t.roster) {
      if (typeof slot === 'string') ownership[slot] = (ownership[slot] || 0) + 1;
    }
  }
  for (const g of Object.values(golfers)) {
    g.ownedBy = ownership[g.id] || 0;
    g.ownedPct = teams.length ? g.ownedBy / teams.length : 0;
  }

  const state = {
    meta: {
      event: TOURNAMENT.event,
      course: TOURNAMENT.course,
      parFront: PAR_FRONT,
      parBack: PAR_BACK,
      par: PAR_FRONT + PAR_BACK,
      salaryCap: TOURNAMENT.salaryCap,
      entries: teams.length,
      owners: new Set(teams.map((t) => t.owner)).size,
      pot: prizeInfo.pot || teams.length * TOURNAMENT.entryFee,
      entryFee: TOURNAMENT.entryFee,
      currentRound: 1,
      cutApplied: false,
      lockedRounds: TOURNAMENT.lockedRounds, // sheet rounds; live sync must not overwrite
      importedAt: new Date().toISOString(),
      lastSync: null,
    },
    golfers,
    teams,
    prizes: prizeInfo.prizes,
  };

  if (unmatchedNames.size) {
    console.warn(
      `[generate-data] ${unmatchedNames.size} roster names not found in Golfer Data:`,
      [...unmatchedNames].join(', ')
    );
  }
  console.log(
    `[generate-data] ${Object.keys(golfers).length} golfers, ${teams.length} team entries, ${state.meta.owners} owners.`
  );
  return state;
}

const wbPath = xlsxPath();
const outDir = join(ROOT, 'web', 'public');
const outPath = join(outDir, 'data.json');

// The workbook is kept out of the (public) repo, so CI has no .xlsx to parse and
// builds from the committed data.json instead. Only regenerate when the workbook
// is actually present locally.
if (!existsSync(wbPath)) {
  if (existsSync(outPath)) {
    console.warn(`[generate-data] workbook not found — using committed ${outPath}`);
    process.exit(0);
  }
  console.error(`[generate-data] workbook not found (${wbPath}) and no existing data.json — cannot build.`);
  process.exit(1);
}

const state = importWorkbook(wbPath);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`[generate-data] wrote ${outPath}`);
