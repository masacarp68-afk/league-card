// 順位表を Canvas に描く。X 投稿用に 1920×1080（16:9）
// 黒に近いフラットな地に、角丸の2行カード（名前／pt）を縦に詰めて並べる
export const W = 1920, H = 1080;
const FONT = '"Noto Sans JP", "Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif';

const MARGIN = 40;           // 左右の余白
const HEADER_CY = 80;        // ヘッダー（タイトル・バッジ・ロゴ）の中心の高さ
const HEADER_LINE_Y = 154;   // ヘッダー下の金ライン
const BODY_TOP = 172;        // 選手一覧の上端
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

// 1〜3位の丸に付ける色。medals が false のリーグ戦などでは色を付けない
export function medalOf(rank, medals) {
  if (!medals) return null;
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
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

// 右上に白いプレートを置いてロゴを収める。プレートの左端の x を返す（ロゴ無しなら右余白の位置）
// ほぼ正方形のロゴは丸に、横長のロゴは角丸の横長プレートに載せる
function drawLogo(ctx, logo, right) {
  if (!logo || !logo.naturalWidth) return right;
  const src = logoContentRect(logo);
  const d = 116, cy = HEADER_CY;
  const aspect = src.w / src.h;
  ctx.fillStyle = '#ffffff';
  if (aspect <= 1.25) {
    const pad = 15, cx = right - d / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fill();
    // 丸に内接する正方形に収める
    const box = d - pad * 2;
    let iw = box, ih = box * src.h / src.w;
    if (ih > box) { ih = box; iw = box * src.w / src.h; }
    ctx.drawImage(logo, src.x, src.y, src.w, src.h, cx - iw / 2, cy - ih / 2, iw, ih);
    return cx - d / 2;
  }
  const pad = 10;
  const ih = d - pad * 2, iw = ih * aspect;
  const pw = iw + pad * 2, px = right - pw;
  roundRect(ctx, px, cy - d / 2, pw, d, 12);
  ctx.fill();
  ctx.drawImage(logo, src.x, src.y, src.w, src.h, px + pad, cy - ih / 2, iw, ih);
  return px;
}

// 「第1節」の金バッジ。バッジの左端の x を返す（節が空なら right のまま）
function drawSessionBadge(ctx, session, right) {
  if (!session) return right;
  ctx.font = `700 40px ${FONT}`;
  const bw = ctx.measureText(session).width + 52, bh = 66;
  const bx = right - bw, by = HEADER_CY - bh / 2;
  roundRect(ctx, bx, by, bw, bh, 10);
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
  let px = 92;
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

// カードの組み方。横長なら1行（名前 入会期 … pt 対局数）、そうでなければ2行（名前／pt）
export function cardLayout(w, h) {
  return w / h >= 5.5 ? 'row' : 'stack';
}

// 順位の丸（金銀銅を使う大会だけ 1〜3位に色を付ける）
function drawRankCircle(ctx, rank, cx, cy, d, pal, medals) {
  const key = medalOf(rank, medals);
  const medal = key ? COLORS[key] : null;
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = medal || pal.circle;
  ctx.fill();
  ctx.fillStyle = medal ? COLORS.onMedal : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFontSize(ctx, String(rank), 700, Math.round(d * 0.5), d * 0.8, Math.round(d * 0.32));
  ctx.fillText(String(rank), cx, cy + 1);
}

// 「名前＋入会期」を maxW に収める組み方を決める（文字サイズ・省略・全体の幅）
// periodScale は入会期の文字サイズ（名前に対する倍率）
function layoutNameAndPeriod(ctx, p, maxW, unit, periodScale) {
  const period = String(p.period || '');
  const periodFont = `400 ${Math.round(unit * periodScale)}px ${FONT}`;
  const gap = Math.round(unit * 0.35);
  let periodW = 0;
  if (period) {
    ctx.font = periodFont;
    periodW = ctx.measureText(period).width + gap;
  }
  fitFontSize(ctx, p.name, 700, Math.round(unit), maxW - periodW, Math.round(unit * 0.7));
  const nameFont = ctx.font;
  const name = fitText(ctx, p.name, maxW - periodW);
  const nameW = ctx.measureText(name).width;
  return { name, nameFont, nameW, period, periodFont, periodScale, gap, width: nameW + periodW };
}

// layoutNameAndPeriod で決めた組みを x から描く
function drawNameAndPeriod(ctx, nl, x, y, unit, color) {
  ctx.textAlign = 'left';
  ctx.font = nl.nameFont;
  ctx.fillStyle = color;
  ctx.fillText(nl.name, x, y);
  if (nl.period) {
    ctx.font = nl.periodFont;
    ctx.fillStyle = COLORS.games;
    // 小さい文字ほど少し下げて、名前と下端をそろえる
    ctx.fillText(nl.period, x + nl.nameW + nl.gap, y + unit * (1 - nl.periodScale) * 0.25);
  }
}

function ptColor(pt) {
  return pt.startsWith('▲') ? COLORS.negative : pt.startsWith('±') ? COLORS.zero : COLORS.positive;
}

// 今節の成績「(+58.3)」。今節が無い・表示しない設定なら ''
function latestLabel(p, opts) {
  if (!opts.showLatest || p.latest === null || p.latest === undefined) return '';
  return `(${fmtPt(p.latest)})`;
}

function gamesLabel(p, opts) {
  if (!opts.showGames || p.games === null || p.games === undefined) return '';
  return opts.totalGames ? `${p.games}/${opts.totalGames}` : `${p.games}`;
}

// 「pt 対局数 (今節)」の1行を maxW に収める組み方を決める（入りきらなければ3つとも小さくする）
function fitPtLine(ctx, pt, latest, label, maxW, unit) {
  const min = Math.round(unit * 0.6);
  for (let px = Math.round(unit); ; px -= 1) {
    const latestPx = Math.round(px * 0.7), gamesPx = Math.round(px * 0.62);
    const gap = Math.round(px * 0.28);
    ctx.font = `900 ${px}px ${FONT}`;
    const ptW = ctx.measureText(pt).width;
    let latestW = 0;
    if (latest) {
      ctx.font = `700 ${latestPx}px ${FONT}`;
      latestW = ctx.measureText(latest).width + gap;
    }
    let labelW = 0;
    if (label) {
      ctx.font = `400 ${gamesPx}px ${FONT}`;
      labelW = ctx.measureText(label).width + gap;
    }
    const line = { pt, latest, label, px, latestPx, gamesPx, gap, ptW, latestW, labelW, width: ptW + latestW + labelW };
    if (line.width <= maxW || px <= min) return line;
  }
}

// fitPtLine で決めた1行を x から描く（pt → 対局数 → 今節 の順）
function drawPtLine(ctx, line, x, y, p) {
  ctx.textAlign = 'left';
  ctx.font = `900 ${line.px}px ${FONT}`;
  ctx.fillStyle = ptColor(line.pt);
  ctx.fillText(line.pt, x, y);
  let px = x + line.ptW + line.gap;
  if (line.label) {
    ctx.font = `400 ${line.gamesPx}px ${FONT}`;
    ctx.fillStyle = COLORS.games;
    ctx.fillText(line.label, px, y + line.px * 0.12);
    px += line.labelW;
  }
  if (line.latest) {
    ctx.font = `700 ${line.latestPx}px ${FONT}`;
    ctx.fillStyle = ptColor(fmtPt(p.latest));
    ctx.fillText(line.latest, px, y + line.px * 0.08);
  }
}

// 2行組み：(順位の丸)｜  名前 入会期
//                    ｜  pt 対局数   （順位の丸の右の空き幅に、2行とも中央寄せ）
function drawCardStack(ctx, p, x, y, w, h, st, opts, pal, medals) {
  const unit = Math.min(h * 0.37, w / 9);
  const pad = Math.round(unit * 0.38);
  const d = Math.round(unit * 1.7);
  drawRankCircle(ctx, p.rank, x + pad + d / 2, y + h / 2, d, pal, medals);

  const tx = x + pad + d + Math.round(unit * 0.35);
  const tw = x + w - Math.round(pad * 0.8) - tx;
  const nameY = y + h * 0.32, ptY = y + h * 0.71;
  ctx.textBaseline = 'middle';

  // 2行とも幅を先に測ってから、空いた分だけ右にずらして中央に置く
  const nl = layoutNameAndPeriod(ctx, p, tw, unit, 0.8);
  const pt = fmtPt(p.total);
  const label = gamesLabel(p, opts);
  const latest = latestLabel(p, opts);
  const line = fitPtLine(ctx, pt, latest, label, tw, unit);
  const centered = lineW => tx + Math.max(0, (tw - lineW) / 2);

  drawNameAndPeriod(ctx, nl, centered(nl.width), nameY, unit, st.name);
  drawPtLine(ctx, line, centered(line.width), ptY, p);
}

// 1行組み：(順位の丸)｜名前 入会期 ……… pt 対局数
function drawCardRow(ctx, p, x, y, w, h, st, opts, pal, medals) {
  const label = gamesLabel(p, opts);
  const latest = latestLabel(p, opts);
  // 今節を出すと数字が増えるので、そのぶん全体を小さくして名前の幅を残す
  const unit = Math.min(h * 0.56, w / (latest ? 17 : 13));
  const pad = Math.round(unit * 0.35);
  const d = Math.round(h * 0.72);
  const midY = y + h / 2 + 1;
  drawRankCircle(ctx, p.rank, x + pad + d / 2, y + h / 2, d, pal, medals);

  // 右端に pt・今節・対局数、残った幅に名前と入会期
  ctx.textBaseline = 'middle';
  const pt = fmtPt(p.total);
  const nameX = x + pad + d + Math.round(unit * 0.4);
  const line = fitPtLine(ctx, pt, latest, label, x + w - pad - nameX, unit);
  drawPtLine(ctx, line, x + w - pad - line.width, midY, p);
  drawNameAndPeriod(ctx, layoutNameAndPeriod(ctx, p, x + w - pad - line.width - Math.round(unit * 0.5) - nameX, unit, 0.62), nameX, midY, unit, st.name);
}

// 1枚のカード：地と枠を描いてから、横長なら1行組み、そうでなければ2行組み
function drawCard(ctx, p, x, y, w, h, zone, opts, pal, medals) {
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
  if (cardLayout(w, h) === 'row') drawCardRow(ctx, p, x, y, w, h, st, opts, pal, medals);
  else drawCardStack(ctx, p, x, y, w, h, st, opts, pal, medals);
}

function drawPlayers(ctx, players, s, pal) {
  const n = players.length;
  const { cols, rows } = layoutFor(n);
  const colW = (W - MARGIN * 2 - COL_GAP * (cols - 1)) / cols;
  const rowH = Math.min(MAX_CARD_H, (BODY_BOTTOM - BODY_TOP - ROW_GAP * (rows - 1)) / rows);
  const opts = {
    totalGames: Number(s.totalGames) || 0,
    showGames: s.showGames !== false,
    showLatest: s.showLatest !== false,
  };
  const ups = [s.promote1, s.promote2, s.promote3];
  const downs = [s.demote1, s.demote2];
  players.forEach((p, i) => {
    // 縦に埋めて次の列へ（1〜11 が左列、12〜22 が次の列…）
    const col = Math.floor(i / rows), row = i % rows;
    const x = MARGIN + col * (colW + COL_GAP);
    const y = BODY_TOP + row * (rowH + ROW_GAP);
    drawCard(ctx, p, x, y, colW, rowH, zoneOf(p.rank, n, ups, downs), opts, pal, s.medals);
  });
}

// 左下に小さくクレジット
function drawCredit(ctx, credit) {
  const text = String(credit || '').trim();
  if (!text) return;
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `400 20px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, MARGIN, H - 16);
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

// data: { players: [{ rank, name, total, games, latest?, period? }] }
// settings: { title, session, totalSessions, totalGames, promote1..3, demote1..2, color, showGames, showLatest, medals, credit }
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
  drawCredit(ctx, settings.credit);
  drawFooter(ctx, settings);
  return canvas;
}
