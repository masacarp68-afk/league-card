// 順位表を Canvas に描く。X 投稿用に 1920×1080（16:9）
export const W = 1920, H = 1080;
const FONT = '"Noto Sans JP", "Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

const MARGIN = 50;           // 左右の余白
const BODY_TOP = 180;        // 選手一覧の上端
const BODY_BOTTOM = H - 60;  // 選手一覧の下端
const COL_GAP = 24;
const ROW_GAP = 10;
const MAX_ROW_H = 100;

const COLORS = {
  name: '#ffffff',
  positive: '#5ab0ff',
  negative: '#ff5a5a',
  games: 'rgba(255,255,255,0.55)',
  gold: '#f6c945',
  session: '#a9c8ff',
  footer: 'rgba(255,255,255,0.75)',
};

// 昇級／残留／降級ゾーンごとのカードの色
const ZONE_STYLE = {
  up:   { fill: 'rgba(214,176,52,0.22)', strip: 'rgba(214,176,52,0.28)', border: 'rgba(246,201,69,0.8)',  rank: '#f6c945' },
  stay: { fill: 'rgba(0,0,0,0.30)',      strip: 'rgba(0,0,0,0.32)',      border: 'rgba(255,255,255,0.28)', rank: '#ffffff' },
  down: { fill: 'rgba(170,28,40,0.45)',  strip: 'rgba(120,10,20,0.5)',   border: 'rgba(255,110,110,0.65)', rank: '#ff6b6b' },
};

// 順位から昇級／残留／降級ゾーンを判定
export function zoneOf(rank, playerCount, promote, demote) {
  if (promote > 0 && rank <= promote) return 'up';
  if (demote > 0 && rank > playerCount - demote) return 'down';
  return 'stay';
}

// 符号付き小数1桁（+374.9 / ▲14.7 / +0.0）
export function fmtPt(v) {
  const s = Math.abs(v).toFixed(1);
  return v < 0 && s !== '0.0' ? `▲${s}` : `+${s}`;
}

// 人数から列数・行数を決める
export function layoutFor(n) {
  const cols = n <= 26 ? 3 : n <= 48 ? 4 : 5;
  return { cols, rows: Math.max(1, Math.ceil(n / cols)) };
}

// 「第24期 雀王戦【A2】リーグ」→ 【 】で囲んだ部分を gold にした区切り
export function splitTitle(title) {
  const parts = [];
  const re = /【([^】]*)】/g;
  let last = 0, m;
  while ((m = re.exec(title))) {
    if (m.index > last) parts.push({ text: title.slice(last, m.index), gold: false });
    if (m[1]) parts.push({ text: m[1], gold: true });
    last = m.index + m[0].length;
  }
  if (last < title.length) parts.push({ text: title.slice(last), gold: false });
  return parts;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0x1c2f7a;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
    px -= 1;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  return px;
}

// 毎回同じ星空になるように固定シードの乱数
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawStars(ctx) {
  const rnd = mulberry32(20260914);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = 0.5 + rnd() * 1.3, a = 0.15 + rnd() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBackground(ctx, color) {
  const [r, g, b] = hexToRgb(color);
  // テーマ色をかなり暗くした地色に、上からテーマ色の光を落とす
  ctx.fillStyle = `rgb(${Math.round(r * 0.28)},${Math.round(g * 0.28)},${Math.round(b * 0.28)})`;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -H * 0.2, 0, W / 2, -H * 0.2, W * 0.75);
  glow.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  drawStars(ctx);
}

// 右上にロゴを白いプレートに載せて描く。プレートの幅を返す（ロゴ無しなら 0）
function drawLogo(ctx, logo) {
  if (!logo || !logo.naturalWidth) return 0;
  const plateH = 124, pad = 10;
  const imgH = plateH - pad * 2;
  const imgW = imgH * logo.naturalWidth / logo.naturalHeight;
  const plateW = imgW + pad * 2;
  const x = W - MARGIN - plateW, y = 26;
  roundRect(ctx, x, y, plateW, plateH, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.drawImage(logo, x + pad, y + pad, imgW, imgH);
  return plateW;
}

function drawHeader(ctx, s, logo) {
  const plateW = drawLogo(ctx, logo);
  const side = MARGIN + (plateW ? plateW + 30 : 0);
  const maxW = W - side * 2;
  const parts = splitTitle(String(s.title || ''));
  const session = String(s.session || '');
  // タイトル＋節を1行に収まるサイズにして中央揃え
  let px = 64;
  const measure = () => {
    let w = 0;
    ctx.font = `900 ${px}px ${FONT}`;
    for (const p of parts) w += ctx.measureText(p.text).width;
    if (session) {
      ctx.font = `700 ${Math.round(px * 0.56)}px ${FONT}`;
      w += 28 + ctx.measureText(session).width;
    }
    return w;
  };
  let total = measure();
  while (px > 28 && total > maxW) { px -= 2; total = measure(); }
  let x = (W - total) / 2;
  const y = 100;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.font = `900 ${px}px ${FONT}`;
  for (const p of parts) {
    ctx.fillStyle = p.gold ? COLORS.gold : '#ffffff';
    ctx.fillText(p.text, x, y);
    x += ctx.measureText(p.text).width;
  }
  if (session) {
    ctx.font = `700 ${Math.round(px * 0.56)}px ${FONT}`;
    ctx.fillStyle = COLORS.session;
    ctx.fillText(session, x + 28, y);
  }
  ctx.shadowBlur = 0;
}

// 1行：順位｜名前 ……… pt 対局数
function drawPlayerRow(ctx, p, x, y, w, h, zone, opts) {
  const st = ZONE_STYLE[zone];
  const stripW = Math.round(h * 0.55);
  ctx.fillStyle = st.fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = st.strip;
  ctx.fillRect(x, y, stripW, h);
  ctx.lineWidth = 2;
  ctx.strokeStyle = st.border;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

  // 行の高さと列の幅の両方から文字サイズを決める
  const unit = Math.min(h * 0.36, w / 13);
  const midY = y + h / 2 + 1;
  ctx.textBaseline = 'middle';

  // 順位
  ctx.textAlign = 'center';
  ctx.fillStyle = st.rank;
  ctx.font = `700 ${Math.round(unit * 0.8)}px ${FONT}`;
  ctx.fillText(String(p.rank), x + stripW / 2, midY);

  // 右端から 対局数 → pt の順に詰める
  const pad = Math.round(unit * 0.4);
  let right = x + w - pad;
  if (opts.showGames && p.games !== null && p.games !== undefined) {
    const label = opts.totalGames ? `${p.games}/${opts.totalGames}` : `${p.games}`;
    ctx.font = `400 ${Math.round(unit * 0.5)}px ${FONT}`;
    ctx.fillStyle = COLORS.games;
    ctx.textAlign = 'right';
    ctx.fillText(label, right, midY + unit * 0.12);
    right -= ctx.measureText(label).width + Math.round(unit * 0.3);
  }
  const pt = fmtPt(p.total);
  ctx.font = `900 ${Math.round(unit * 0.95)}px ${FONT}`;
  ctx.fillStyle = pt.startsWith('▲') ? COLORS.negative : COLORS.positive;
  ctx.textAlign = 'right';
  ctx.fillText(pt, right, midY);
  right -= ctx.measureText(pt).width + Math.round(unit * 0.45);

  // 名前（残った幅に収める。収まらなければ少し小さくしてから…で省略）
  const nameX = x + stripW + Math.round(unit * 0.4);
  const nameW = right - nameX;
  fitFontSize(ctx, p.name, 700, Math.round(unit), nameW, Math.round(unit * 0.68));
  ctx.fillStyle = COLORS.name;
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, p.name, nameW), nameX, midY);
}

function drawPlayers(ctx, players, s) {
  const n = players.length;
  const { cols, rows } = layoutFor(n);
  const colW = (W - MARGIN * 2 - COL_GAP * (cols - 1)) / cols;
  const rowH = Math.min(MAX_ROW_H, (BODY_BOTTOM - BODY_TOP - ROW_GAP * (rows - 1)) / rows);
  const opts = {
    totalGames: Number(s.totalGames) || 0,
    showGames: s.showGames !== false,
  };
  const promote = Number(s.promote) || 0;
  const demote = Number(s.demote) || 0;
  players.forEach((p, i) => {
    // 見本と同じく縦に埋めて次の列へ（1〜8 が左列、9〜16 が次の列…）
    const col = Math.floor(i / rows), row = i % rows;
    const x = MARGIN + col * (colW + COL_GAP);
    const y = BODY_TOP + row * (rowH + ROW_GAP);
    drawPlayerRow(ctx, p, x, y, colW, rowH, zoneOf(p.rank, n, promote, demote), opts);
  });
}

function drawFooter(ctx, s) {
  const parts = [];
  if (Number(s.totalSessions)) parts.push(`全${Number(s.totalSessions)}節`);
  if (Number(s.totalGames)) parts.push(`${Number(s.totalGames)}回戦`);
  if (parts.length === 0) return;
  ctx.fillStyle = COLORS.footer;
  ctx.font = `700 24px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(parts.join('・'), W - MARGIN, H - 22);
  ctx.textAlign = 'left';
}

// data: { players: [{ rank, name, total, games }] }
// settings: { title, session, totalSessions, totalGames, promote, demote, color, showGames }
// assets: { logo: HTMLImageElement | null }
export function renderStandings(data, settings, assets = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, settings.color);
  drawHeader(ctx, settings, assets.logo);
  drawPlayers(ctx, data.players, settings);
  drawFooter(ctx, settings);
  return canvas;
}
