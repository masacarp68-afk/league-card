// 順位表を Canvas に描く。X 投稿用に 1920×1080（16:9）
// 黒に近いフラットな地に、角丸の2行カード（名前／pt）を縦に詰めて並べる
export const W = 1920, H = 1080;
const FONT = '"Noto Sans JP", "Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

const MARGIN = 40;           // 左右の余白
const HEADER_CY = 76;        // ヘッダー（タイトル・バッジ・ロゴ）の中心の高さ
const HEADER_LINE_Y = 150;   // ヘッダー下の金ライン
const BODY_TOP = 176;        // 選手一覧の上端
const BODY_BOTTOM = H - 48;  // 選手一覧の下端
const COL_GAP = 16;
const ROW_GAP = 9;
const MAX_ROWS = 11;         // 縦にこれ以上は詰めず、列を増やす
const MAX_CARD_H = 104;
const CARD_RADIUS = 8;

const COLORS = {
  name: '#ffffff',
  positive: '#6fe3a8',
  negative: '#ff6b6b',
  zero: '#b8bccb',
  games: '#9aa0b4',
  gold: '#f2c14e',
  silver: '#d7dfea',
  bronze: '#e0965f',
  onMedal: '#1a1408',
  footer: 'rgba(255,255,255,0.7)',
};

// ゾーンごとのカードの色。昇級は上位から 金→銀→銅、降級は下位から 赤→薄赤
// tint はカードの地に重ねる色、border は枠、name は名前の文字色
const ZONE_STYLE = {
  up1:   { tint: 'rgba(242,193,78,0.22)',  border: 'rgba(242,193,78,0.9)',   name: COLORS.gold },
  up2:   { tint: 'rgba(215,223,234,0.18)', border: 'rgba(215,223,234,0.85)', name: COLORS.silver },
  up3:   { tint: 'rgba(224,150,95,0.20)',  border: 'rgba(224,150,95,0.85)',  name: COLORS.bronze },
  stay:  { tint: null,                      border: null,                      name: COLORS.name },
  down2: { tint: 'rgba(255,90,90,0.16)',   border: 'rgba(255,110,110,0.5)',  name: COLORS.name },
  down1: { tint: 'rgba(255,90,90,0.30)',   border: 'rgba(255,110,110,0.8)',  name: COLORS.name },
};

// 順位からゾーンを判定。ups = 上位からのグループ人数 [金, 銀, 銅]、downs = 下位からのグループ人数 [赤, 薄赤]
export function zoneOf(rank, playerCount, ups, downs) {
  let acc = 0;
  for (let i = 0; i < ups.length; i++) {
    acc += Number(ups[i]) || 0;
    if (rank <= acc) return `up${i + 1}`;
  }
  acc = 0;
  for (let i = 0; i < downs.length; i++) {
    acc += Number(downs[i]) || 0;
    if (acc > 0 && rank > playerCount - acc) return `down${i + 1}`;
  }
  return 'stay';
}

// 符号付き小数1桁（+374.9 / ▲14.7 / ±0.0）
export function fmtPt(v) {
  const s = Math.abs(v).toFixed(1);
  if (s === '0.0') return '±0.0';
  return v < 0 ? `▲${s}` : `+${s}`;
}

// 人数から列数・行数を決める。縦は MAX_ROWS 行まで詰め、超えたら列を増やす（最低3列）
export function layoutFor(n) {
  const cols = Math.max(3, Math.ceil(n / MAX_ROWS));
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

// 「第25期 日本プロ麻雀協会 後期【E3】リーグ」→ 最後のスペースで、小さく出す前半と大きく出す後半に分ける
// スペースが無ければ全部を大きく出す
export function splitTitleSized(title) {
  const t = String(title || '').trim();
  const m = /^(.*\S)[ 　]+(\S.*)$/.exec(t);
  if (!m) return { small: [], large: splitTitle(t) };
  return { small: splitTitle(m[1]), large: splitTitle(m[2]) };
}

// フッターの文言。「全12節・48回戦」、節が無ければ「全6回戦」、どちらも無ければ ''
export function footerText(totalSessions, totalGames) {
  const sessions = Number(totalSessions) || 0;
  const games = Number(totalGames) || 0;
  const parts = [];
  if (sessions) parts.push(`全${sessions}節`);
  if (games) parts.push(`${sessions ? '' : '全'}${games}回戦`);
  return parts.join('・');
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? parseInt(m[1], 16) : 0x1c2f7a;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// テーマ色から、地色（ほぼ黒）・カード・順位の丸の色を作る
function palette(hex) {
  const [r, g, b] = hexToRgb(hex);
  const mix = (k, add) => `rgb(${Math.round(r * k + add)},${Math.round(g * k + add)},${Math.round(b * k + add)})`;
  return { bg: mix(0.22, 6), card: mix(0.5, 10), circle: mix(0.55, 28) };
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

// ロゴ画像の白い余白を除いた範囲（元画像のピクセル座標）。一度計算したら画像に覚えさせる
function logoContentRect(logo) {
  if (logo._contentRect) return logo._contentRect;
  const w = logo.naturalWidth, h = logo.naturalHeight;
  let rect = { x: 0, y: 0, w, h };
  try {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d');
    c.drawImage(logo, 0, 0);
    const d = c.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        // 透明か白に近いピクセルは余白とみなす
        if (d[i + 3] < 16) continue;
        if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX >= minX && maxY >= minY) rect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } catch { /* 読めなければ全体を使う */ }
  logo._contentRect = rect;
  return rect;
}

// 右上に白い丸を置いてロゴを収める。丸の左端の x を返す（ロゴ無しなら右余白の位置）
function drawLogo(ctx, logo, right) {
  if (!logo || !logo.naturalWidth) return right;
  const d = 100, pad = 15;
  const cx = right - d / 2, cy = HEADER_CY;
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // 丸に内接する正方形に収める
  const src = logoContentRect(logo);
  const box = d - pad * 2;
  let iw = box, ih = box * src.h / src.w;
  if (ih > box) { ih = box; iw = box * src.w / src.h; }
  ctx.drawImage(logo, src.x, src.y, src.w, src.h, cx - iw / 2, cy - ih / 2, iw, ih);
  return cx - d / 2;
}

// 「第1節」の金バッジ。バッジの左端の x を返す（節が空なら right のまま）
function drawSessionBadge(ctx, session, right) {
  if (!session) return right;
  ctx.font = `700 30px ${FONT}`;
  const bw = ctx.measureText(session).width + 44, bh = 52;
  const bx = right - bw, by = HEADER_CY - bh / 2;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fillStyle = COLORS.gold;
  ctx.fill();
  ctx.fillStyle = COLORS.onMedal;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(session, bx + bw / 2, HEADER_CY + 1);
  return bx;
}

// タイトル：前半を小さく、後半を大きく、【 】は金色で左右に少し間を空ける
function drawTitle(ctx, title, maxW) {
  const { small, large } = splitTitleSized(title);
  let px = 70;
  const smallPx = () => Math.round(px * 0.66);
  const gap = () => px * 0.12;
  const widthOf = (parts, weight, size) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    let w = 0;
    parts.forEach((p, i) => {
      w += ctx.measureText(p.text).width;
      if (p.gold) w += (i > 0 ? gap() : 0) + (i < parts.length - 1 ? gap() : 0);
    });
    return w;
  };
  const measure = () => {
    let w = widthOf(large, 900, px);
    if (small.length) w += widthOf(small, 700, smallPx()) + px * 0.3;
    return w;
  };
  while (px > 30 && measure() > maxW) px -= 2;

  const y = HEADER_CY + px * 0.36;
  let x = MARGIN;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const drawParts = (parts, weight, size) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    parts.forEach((p, i) => {
      if (p.gold && i > 0) x += gap();
      ctx.fillStyle = p.gold ? COLORS.gold : '#ffffff';
      ctx.fillText(p.text, x, y);
      x += ctx.measureText(p.text).width;
      if (p.gold && i < parts.length - 1) x += gap();
    });
  };
  if (small.length) {
    drawParts(small, 700, smallPx());
    x += px * 0.3;
  }
  drawParts(large, 900, px);
}

function drawHeader(ctx, s, logo) {
  let right = drawLogo(ctx, logo, W - MARGIN);
  if (right < W - MARGIN) right -= 22;
  const session = String(s.session || '').trim();
  const badgeLeft = drawSessionBadge(ctx, session, right);
  if (badgeLeft < right) right = badgeLeft - 28;
  drawTitle(ctx, String(s.title || ''), right - MARGIN);
  // ヘッダー下の金ライン
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(MARGIN, HEADER_LINE_Y, W - MARGIN * 2, 3);
}

// 1枚：(順位の丸)｜名前
//                 ｜pt 対局数
function drawCard(ctx, p, x, y, w, h, zone, opts, pal) {
  const st = ZONE_STYLE[zone];
  roundRect(ctx, x, y, w, h, CARD_RADIUS);
  ctx.fillStyle = pal.card;
  ctx.fill();
  if (st.tint) {
    ctx.fillStyle = st.tint;
    ctx.fill();
  }
  if (st.border) {
    roundRect(ctx, x + 1, y + 1, w - 2, h - 2, CARD_RADIUS - 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = st.border;
    ctx.stroke();
  }

  // カードの高さと幅の両方から文字サイズを決める
  const unit = Math.min(h * 0.33, w / 10.5);
  const pad = Math.round(unit * 0.5);

  // 順位の丸（1〜3位は金・銀・銅）
  const d = Math.round(unit * 1.85);
  const cx = x + pad + d / 2, cy = y + h / 2;
  const medal = p.rank === 1 ? COLORS.gold : p.rank === 2 ? COLORS.silver : p.rank === 3 ? COLORS.bronze : null;
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = medal || pal.circle;
  ctx.fill();
  ctx.fillStyle = medal ? COLORS.onMedal : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFontSize(ctx, String(p.rank), 700, Math.round(unit * 0.95), d * 0.8, Math.round(unit * 0.55));
  ctx.fillText(String(p.rank), cx, cy + 1);

  // 上段：名前（残った幅に収める。収まらなければ少し小さくしてから…で省略）
  const tx = x + pad + d + Math.round(unit * 0.45);
  const tw = x + w - Math.round(pad * 0.8) - tx;
  const nameY = y + h * 0.34, ptY = y + h * 0.70;
  ctx.textAlign = 'left';
  fitFontSize(ctx, p.name, 700, Math.round(unit), tw, Math.round(unit * 0.7));
  ctx.fillStyle = st.name;
  ctx.fillText(fitText(ctx, p.name, tw), tx, nameY);

  // 下段：pt と対局数
  const pt = fmtPt(p.total);
  ctx.font = `900 ${Math.round(unit)}px ${FONT}`;
  ctx.fillStyle = pt.startsWith('▲') ? COLORS.negative : pt.startsWith('±') ? COLORS.zero : COLORS.positive;
  ctx.fillText(pt, tx, ptY);
  if (opts.showGames && p.games !== null && p.games !== undefined) {
    const label = opts.totalGames ? `${p.games}/${opts.totalGames}` : `${p.games}`;
    const gx = tx + ctx.measureText(pt).width + Math.round(unit * 0.35);
    ctx.font = `400 ${Math.round(unit * 0.62)}px ${FONT}`;
    ctx.fillStyle = COLORS.games;
    ctx.fillText(label, gx, ptY + unit * 0.12);
  }
}

function drawPlayers(ctx, players, s, pal) {
  const n = players.length;
  const { cols, rows } = layoutFor(n);
  const colW = (W - MARGIN * 2 - COL_GAP * (cols - 1)) / cols;
  const rowH = Math.min(MAX_CARD_H, (BODY_BOTTOM - BODY_TOP - ROW_GAP * (rows - 1)) / rows);
  const opts = {
    totalGames: Number(s.totalGames) || 0,
    showGames: s.showGames !== false,
  };
  const ups = [s.promote1, s.promote2, s.promote3];
  const downs = [s.demote1, s.demote2];
  players.forEach((p, i) => {
    // 縦に埋めて次の列へ（1〜11 が左列、12〜22 が次の列…）
    const col = Math.floor(i / rows), row = i % rows;
    const x = MARGIN + col * (colW + COL_GAP);
    const y = BODY_TOP + row * (rowH + ROW_GAP);
    drawCard(ctx, p, x, y, colW, rowH, zoneOf(p.rank, n, ups, downs), opts, pal);
  });
}

function drawFooter(ctx, s) {
  const text = footerText(s.totalSessions, s.totalGames);
  if (!text) return;
  ctx.fillStyle = COLORS.footer;
  ctx.font = `700 22px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, W - MARGIN, H - 16);
  ctx.textAlign = 'left';
}

// data: { players: [{ rank, name, total, games }] }
// settings: { title, session, totalSessions, totalGames, promote1..3, demote1..2, color, showGames }
// assets: { logo: HTMLImageElement | null }
export function renderStandings(data, settings, assets = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const pal = palette(settings.color);
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, W, H);
  drawHeader(ctx, settings, assets.logo);
  drawPlayers(ctx, data.players, settings, pal);
  drawFooter(ctx, settings);
  return canvas;
}
