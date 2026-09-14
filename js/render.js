// 順位表を Canvas に描く。X 投稿用に 1600×900（16:9）
export const W = 1600, H = 900;
const FONT = '"Noto Sans JP", "Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';
export const BADGE_COLORS = { up: '#1e63c8', stay: '#e8781e', down: '#6b6b6b' };

const MARGIN = 60;          // 左右の余白
const BODY_TOP = 170;       // 選手一覧の上端
const BODY_BOTTOM = H - 90; // 選手一覧の下端
const COL_GAP = 36;
const ROW_GAP = 12;
const MAX_ROW_H = 88;

// 順位から昇級／残留／降級ゾーンを判定
export function zoneOf(rank, playerCount, promote, demote) {
  if (promote > 0 && rank <= promote) return 'up';
  if (demote > 0 && rank > playerCount - demote) return 'down';
  return 'stay';
}

// 符号付き小数1桁（+374.9 / -14.7 / +0.0）
export function fmtPt(v) {
  const s = Math.abs(v).toFixed(1);
  return v < 0 && s !== '0.0' ? `-${s}` : `+${s}`;
}

// 人数から列数・行数を決める（24人以下は3列、25人以上は4列）
export function layoutFor(n) {
  const cols = n <= 24 ? 3 : 4;
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0x7a1f2b;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// 長すぎる文字列を幅に収める（はみ出す分は末尾を…に）
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

// 文字列が最大幅に収まるまでフォントサイズを下げる。決まったサイズを返す（ctx.font も設定済み）
function fitFontSize(ctx, text, weight, size, maxWidth, min) {
  let px = size;
  ctx.font = `${weight} ${px}px ${FONT}`;
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  return px;
}

function drawBackground(ctx, color) {
  const [r, g, b] = hexToRgb(color);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, W, H);
  // 右側に明るい斜めの帯
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(W * 0.62, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.42, H);
  ctx.closePath();
  ctx.fill();
  // 下に向かって少し暗く
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawHeader(ctx, s) {
  const title = String(s.title || '');
  const session = String(s.session || '');
  const y = 110;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  // 節の幅を先に測り、タイトルは残り幅に収まるサイズにする
  ctx.font = `700 40px ${FONT}`;
  const sessionW = session ? ctx.measureText(session).width + 28 : 0;
  const px = fitFontSize(ctx, title, 900, 60, W - MARGIN * 2 - sessionW, 28);
  ctx.font = `900 ${px}px ${FONT}`;
  ctx.fillText(title, MARGIN, y);
  const titleW = ctx.measureText(title).width;
  if (session) {
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(session, MARGIN + titleW + 28, y);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(MARGIN, y + 26, W - MARGIN * 2, 2);
}

function drawPlayerRow(ctx, p, x, y, w, h, zone, totalGames) {
  const badgeW = h;
  // 順位バッジ
  ctx.fillStyle = BADGE_COLORS[zone];
  ctx.fillRect(x, y, badgeW, h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 900 ${Math.round(h * 0.5)}px ${FONT}`;
  ctx.fillText(String(p.rank), x + badgeW / 2, y + h / 2 + 2);
  // 白カード
  const cx = x + badgeW + 4, cw = w - badgeW - 4;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx, y, cw, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(cx + 1, y + 1, cw - 2, h - 2);
  // 名前（上段左）
  const pad = 14;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `700 ${Math.round(h * 0.32)}px ${FONT}`;
  ctx.fillText(fitText(ctx, p.name, cw - pad * 2), cx + pad, y + h * 0.42);
  // 対局数（下段右・小さくグレー）
  let right = cx + cw - pad;
  if (p.games !== null && p.games !== undefined) {
    const label = totalGames ? `[${p.games}/${totalGames}]` : `[${p.games}]`;
    ctx.font = `400 ${Math.round(h * 0.22)}px ${FONT}`;
    ctx.fillStyle = '#6b6b6b';
    ctx.textAlign = 'right';
    ctx.fillText(label, right, y + h * 0.82);
    right -= ctx.measureText(label).width + 10;
  }
  // pt（下段・対局数の左）
  ctx.font = `900 ${Math.round(h * 0.4)}px ${FONT}`;
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'right';
  ctx.fillText(fmtPt(p.total), right, y + h * 0.84);
  ctx.textAlign = 'left';
}

function drawPlayers(ctx, players, s) {
  const n = players.length;
  const { cols, rows } = layoutFor(n);
  const colW = (W - MARGIN * 2 - COL_GAP * (cols - 1)) / cols;
  const rowH = Math.min(MAX_ROW_H, (BODY_BOTTOM - BODY_TOP - ROW_GAP * (rows - 1)) / rows);
  const promote = Number(s.promote) || 0;
  const demote = Number(s.demote) || 0;
  const totalGames = Number(s.totalGames) || 0;
  players.forEach((p, i) => {
    // 見本と同じく縦に埋めて次の列へ（1〜8 が左列、9〜16 が中央…）
    const col = Math.floor(i / rows), row = i % rows;
    const x = MARGIN + col * (colW + COL_GAP);
    const y = BODY_TOP + row * (rowH + ROW_GAP);
    drawPlayerRow(ctx, p, x, y, colW, rowH, zoneOf(p.rank, n, promote, demote), totalGames);
  });
}

function drawFooter(ctx, s) {
  const parts = [];
  if (Number(s.totalSessions)) parts.push(`全${Number(s.totalSessions)}節`);
  if (Number(s.totalGames)) parts.push(`${Number(s.totalGames)}回戦`);
  if (parts.length === 0) return;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `700 26px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(parts.join('・'), W - MARGIN, H - 40);
  ctx.textAlign = 'left';
}

// data: { players: [{ rank, name, total, games }] }
// settings: { title, session, totalSessions, totalGames, promote, demote, color }
export function renderStandings(data, settings) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, settings.color);
  drawHeader(ctx, settings);
  drawPlayers(ctx, data.players, settings);
  drawFooter(ctx, settings);
  return canvas;
}
