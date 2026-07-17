// Parses "Golf Pool - Open Championship 2026.xlsx" into the JSON store.
//  - "Golfer Data" sheet  -> master golfer list + per-round front9/back9 to-par scores
//  - each participant tab  -> one or more stacked 6-golfer team entries
//  - "Leaderboard" sheet   -> prize payout structure
import XLSXpkg from 'xlsx';
const XLSX = XLSXpkg.default || XLSXpkg;
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { fold, slug } from './names.js';
import { save, setState, emptyState } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Royal Birkdale 2026: par 70, front nine par 34, back nine par 36 (validated vs. ESPN).
export const PAR_FRONT = 34;
export const PAR_BACK = 36;

const DATA_SHEETS = new Set(['Golfer Data', 'Leaderboard', 'Golfer Frequency']);

export function defaultXlsxPath() {
  const envPath = process.env.POOL_XLSX;
  if (envPath && existsSync(envPath)) return envPath;
  return join(__dirname, '..', '..', 'Golf Pool - Open Championship 2026.xlsx');
}

function sheetGrid(ws) {
  // Array-of-arrays; formula cells resolve to their cached value; blanks -> null.
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseGolferData(grid) {
  // Row 0: round group header, Row 1: column header, Row 2+: golfers.
  // Cols: 0 name, 1 salaryRaw, 2 cost, 3 r1f9, 4 r1b9, 5 r2f9, 6 r2b9,
  //       7 r3f9, 8 r3b9, 9 r4f9, 10 r4b9, 11 teams, 12 pct
  const golfers = {};
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] || [];
    const name = row[0];
    if (name == null || String(name).trim() === '') continue;
    const id = slug(name);
    const cost = num(row[2]); // pool salary units, e.g. 13.3
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
      cut: 'active', // active | made | cut | wd
      position: null,
      thru: null,
      today: null,
      totalToPar: null,
    };
  }
  return golfers;
}

function parseParticipantSheet(sheetName, grid, golferIndex) {
  const owner = (grid[0] && grid[0][0]) ? String(grid[0][0]).trim() : sheetName;
  // Blocks begin at rows where column index 2 === 'Round 1'.
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
      roster,                 // array of golferIds (strings); unmatched -> {unmatched}
      rosterNames,
      totalSalary,
      paid: true,             // pool is closed; everyone in the sheet has paid
      status: 'active',
    });
  });
  return teams;
}

function parsePrizes(grid) {
  // Leaderboard row 1 header: Rank | Team | Score | Prize | ...
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

export function importWorkbook(xlsxPath = defaultXlsxPath()) {
  if (!existsSync(xlsxPath)) throw new Error(`Workbook not found: ${xlsxPath}`);
  const wb = XLSX.readFile(xlsxPath, { cellFormula: false, cellText: false });

  const golferDataWs = wb.Sheets['Golfer Data'];
  if (!golferDataWs) throw new Error('Missing "Golfer Data" sheet');
  const golfers = parseGolferData(sheetGrid(golferDataWs));

  // Index golfers by folded name for roster matching.
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

  // Ownership counts from actual rosters.
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

  const state = emptyState();
  state.meta = {
    event: 'The Open Championship 2026',
    course: 'Royal Birkdale',
    parFront: PAR_FRONT,
    parBack: PAR_BACK,
    par: PAR_FRONT + PAR_BACK,
    salaryCap: 50,
    entries: teams.length,
    owners: new Set(teams.map((t) => t.owner)).size,
    pot: prizeInfo.pot || teams.length * 20,
    entryFee: 20,
    currentRound: 1,
    cutApplied: false,
    lockedRounds: [1], // Round 1 comes from the sheet; live sync must not overwrite it
    importedAt: new Date().toISOString(),
    lastSync: null,
    source: xlsxPath,
  };
  state.golfers = golfers;
  state.teams = teams;
  state.prizes = prizeInfo.prizes;

  if (unmatchedNames.size) {
    console.warn(`[import] ${unmatchedNames.size} roster names not found in Golfer Data:`,
      [...unmatchedNames].join(', '));
  }
  console.log(`[import] ${Object.keys(golfers).length} golfers, ${teams.length} team entries, ${state.meta.owners} owners.`);
  return state;
}

// CLI: `node src/importer.js --save`
const invokedDirectly = process.argv[1] && fold(process.argv[1]).endsWith('importerjs');
if (invokedDirectly) {
  const state = importWorkbook();
  setState(state);
  if (process.argv.includes('--save')) {
    save(state);
    console.log('[import] saved to store.');
  }
}
