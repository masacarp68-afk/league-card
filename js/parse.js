// スプレッドシートからコピーした TSV（見出し行つき）を選手一覧に変換する
const HEADER_PATTERNS = {
  name: /登録名|選手名|氏名|名前/,
  total: /トータル|合計|累計|ポイント/,
  games: /対局数|試合数|回戦/,
  rank: /順位/,
};

export class ParseError extends Error {}

// "1,234.5" "+12.3" "－5" "▲5" "１２３" → number。変換できなければ NaN
export function parseNumber(s) {
  if (s === null || s === undefined) return NaN;
  const t = String(s)
    .replace(/[０-９．]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,\s+]/g, '')
    .replace(/^[▲△]/, '-')
    .replace(/[－−]/g, '-');
  if (t === '') return NaN;
  return Number(t);
}

function splitRows(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.split('\t').map(c => c.trim()))
    .filter(cells => cells.some(c => c !== ''));
}

function findColumns(header) {
  const cols = {};
  for (const [key, re] of Object.entries(HEADER_PATTERNS)) {
    const i = header.findIndex(h => re.test(h));
    if (i >= 0) cols[key] = i;
  }
  return cols;
}

// 必須の見出しが揃った行を先頭の数行から探す。無ければ -1
// （見出しの上に①〜⑥のような行が混ざっていても読めるように）
function findHeaderRow(rows, requiredPatterns) {
  const limit = Math.min(rows.length, 5);
  for (let i = 0; i < limit; i++) {
    if (requiredPatterns.every(re => rows[i].some(h => re.test(h)))) return i;
  }
  return -1;
}

export function parseStandings(text) {
  const rows = splitRows(text);
  if (rows.length === 0) throw new ParseError('貼り付け内容が空です');
  const hi = findHeaderRow(rows, [HEADER_PATTERNS.name, HEADER_PATTERNS.total]);
  if (hi < 0) {
    throw new ParseError('「登録名」「トータル」の見出しが見つかりません。見出し行を含めてコピーしてください');
  }
  const cols = findColumns(rows[hi]);
  const players = [];
  for (const row of rows.slice(hi + 1)) {
    const name = row[cols.name] || '';
    const total = parseNumber(row[cols.total]);
    if (!name || Number.isNaN(total)) continue;
    const games = cols.games === undefined ? NaN : parseNumber(row[cols.games]);
    const rank = cols.rank === undefined ? NaN : parseNumber(row[cols.rank]);
    players.push({
      rank: Number.isNaN(rank) ? players.length + 1 : rank,
      name,
      total,
      games: Number.isNaN(games) ? null : games,
    });
  }
  if (players.length === 0) throw new ParseError('選手の行が見つかりません');
  return { players };
}
