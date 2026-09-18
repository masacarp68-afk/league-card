// スプレッドシートからコピーした TSV（見出し行つき）を選手一覧に変換する
const NAME_RE = /登録名|選手名|氏名|名前/;
const HEADER_PATTERNS = {
  name: NAME_RE,
  total: /トータル|合計|累計|ポイント/,
  games: /対局数|試合数|回戦/,
  rank: /順位/,
};
// 雀竜位戦：ポイント列（各回戦の「合計点」は除外）と、各回戦の得失点列
const JANTORYU_TOTAL_RE = /ポイント|トータル|累計|合計(?!点)/;
const SCORE_RE = /得失点/;
// フレッシュスターカップ：入会期列と、各回戦（1回戦〜決勝）の列
const PERIOD_RE = /入会期|期生|入会/;
const ROUND_RE = /回戦|準決勝|決勝/;

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

// ポイントの高い順に並べ替えて順位を付ける。同点は同順位（1, 2, 2, 4）
export function rankByTotal(players) {
  const sorted = [...players].sort((a, b) => b.total - a.total);
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || sorted[i - 1].total !== p.total) rank = i + 1;
    return { rank, name: p.name, total: p.total, games: p.games };
  });
}

// 雀竜位戦のシート：登録名／ポイント のあとに各回戦の 得失点／順位／合計点 が並ぶ
// 各回戦の「順位」（着順）は無視し、ポイント順に並べ替えて順位を付ける。対局数 = 得失点が入っている回戦の数
export function parseJantoryu(text) {
  const rows = splitRows(text);
  if (rows.length === 0) throw new ParseError('貼り付け内容が空です');
  const hi = findHeaderRow(rows, [NAME_RE, JANTORYU_TOTAL_RE]);
  if (hi < 0) {
    throw new ParseError('「登録名」「ポイント」の見出しが見つかりません。見出し行を含めてコピーしてください');
  }
  const header = rows[hi];
  const nameCol = header.findIndex(h => NAME_RE.test(h));
  const totalCol = header.findIndex(h => JANTORYU_TOTAL_RE.test(h));
  const scoreCols = header.map((h, i) => (SCORE_RE.test(h) ? i : -1)).filter(i => i >= 0);
  const players = [];
  for (const row of rows.slice(hi + 1)) {
    const name = row[nameCol] || '';
    const total = parseNumber(row[totalCol]);
    // 「供託」「check sum」の行はここで落ちる
    if (!name || Number.isNaN(total)) continue;
    const games = scoreCols.length === 0
      ? null
      : scoreCols.filter(i => !Number.isNaN(parseNumber(row[i]))).length;
    players.push({ name, total, games });
  }
  if (players.length === 0) throw new ParseError('選手の行が見つかりません');
  return { players: rankByTotal(players) };
}

// フレッシュスターカップのシート：順位／氏名／入会期／合計 のあとに 1回戦〜決勝 が並ぶ
// 順位はシートの列をそのまま使う（決勝の結果順なので並べ替えない。無ければ貼った順）
// 対局数 = 回戦の列に数値が入っている数。入会期は文字のまま持つ
export function parseFreshStar(text) {
  const rows = splitRows(text);
  if (rows.length === 0) throw new ParseError('貼り付け内容が空です');
  const hi = findHeaderRow(rows, [NAME_RE, JANTORYU_TOTAL_RE]);
  if (hi < 0) {
    throw new ParseError('「氏名」「合計」の見出しが見つかりません。見出し行を含めてコピーしてください');
  }
  const header = rows[hi];
  const nameCol = header.findIndex(h => NAME_RE.test(h));
  const totalCol = header.findIndex(h => JANTORYU_TOTAL_RE.test(h));
  const rankCol = header.findIndex(h => HEADER_PATTERNS.rank.test(h));
  const periodCol = header.findIndex(h => PERIOD_RE.test(h));
  const roundCols = header.map((h, i) => (ROUND_RE.test(h) ? i : -1)).filter(i => i >= 0);
  const players = [];
  for (const row of rows.slice(hi + 1)) {
    const name = row[nameCol] || '';
    const total = parseNumber(row[totalCol]);
    if (!name || Number.isNaN(total)) continue;
    const rank = rankCol < 0 ? NaN : parseNumber(row[rankCol]);
    const games = roundCols.length === 0
      ? null
      : roundCols.filter(i => !Number.isNaN(parseNumber(row[i]))).length;
    players.push({
      rank: Number.isNaN(rank) ? players.length + 1 : rank,
      name,
      total,
      games,
      period: periodCol < 0 ? '' : (row[periodCol] || ''),
    });
  }
  if (players.length === 0) throw new ParseError('選手の行が見つかりません');
  return { players };
}
