# リーグ順位表 画像ジェネレーター 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スプレッドシートからコピーした順位表（TSV）を貼り付けると、X 投稿用の 1600×900 PNG 順位表画像を生成する静的 Web ツールを作る。

**Architecture:** 依存ゼロの静的サイト。`js/parse.js`（TSV→選手配列、純粋関数）と `js/render.js`（Canvas 描画）を分け、`js/app.js` が画面をつなぐ。パーサーと描画の純粋ヘルパーは `node --test` で検証し、描画結果はブラウザで目視確認する。

**Tech Stack:** HTML / CSS / Vanilla JS（ES Modules）、Canvas 2D、Google Fonts（Noto Sans JP）、Node.js 18+ の `node:test`、GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-14-league-card-design.md`

## Global Constraints

- 依存ライブラリなし（npm パッケージを追加しない）。`package.json` は `"type": "module"` と `npm test` のためだけに置く
- 画像は 1600×900 px PNG
- 列の判定は見出し名で行う：名前 `登録名|選手名|氏名|名前`、pt `トータル|合計|累計|ポイント`、対局数 `対局数|試合数|回戦`、順位 `順位`。名前と pt は必須
- 数値は `,` `+` 空白を除去、全角マイナス（`－` `−`）と `▲` は負号、全角数字は半角に
- バッジ色：昇級 `#1e63c8`、残留 `#e8781e`、降級 `#6b6b6b`。テーマ色の初期値 `#7a1f2b`
- 24人以下は3列、25人以上は4列
- 設定は localStorage キー `league-card.settings` に保存
- コミットメッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける
- ファイルの削除はしない

## File Structure

```
league-card/
  index.html            画面（貼り付け欄・設定欄・ボタン・プレビュー）
  style.css             画面の見た目
  js/parse.js           TSV → { players: [{rank,name,total,games}] }（純粋関数）
  js/render.js          renderStandings(data, settings) → HTMLCanvasElement と純粋ヘルパー
  js/app.js             イベント配線・設定の保存/復元・コピー/ダウンロード
  test/parse.test.js    parse.js のテスト
  test/render.test.js   render.js の純粋ヘルパー（zoneOf / fmtPt / layoutFor）のテスト
  package.json          "type": "module", "test": "node --test"
  README.md             使い方・公開手順
  .claude/launch.json   ブラウザ確認用のローカルサーバー設定
```

---

### Task 1: プロジェクト土台と TSV パーサー

**Files:**
- Create: `package.json`
- Create: `js/parse.js`
- Create: `test/parse.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `parseStandings(text: string): { players: Array<{ rank: number, name: string, total: number, games: number | null }> }` — 失敗時は `ParseError` を throw
  - `parseNumber(s: string): number` — 変換できなければ `NaN`
  - `class ParseError extends Error`

- [ ] **Step 1: package.json を作る**

```json
{
  "name": "league-card",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 失敗するテストを書く**

`test/parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStandings, parseNumber, ParseError } from '../js/parse.js';

const SAMPLE = [
  '順位\t組\t登録名\tトータル\t対局数',
  '1\tD\t山田 太郎\t333.3\t20',
  '2\tA\t佐藤 花子\t-26.3\t13',
].join('\n');

test('見出しから列を判定して選手を読む', () => {
  const { players } = parseStandings(SAMPLE);
  assert.deepEqual(players, [
    { rank: 1, name: '山田 太郎', total: 333.3, games: 20 },
    { rank: 2, name: '佐藤 花子', total: -26.3, games: 13 },
  ]);
});

test('見出しの揺れ（選手名・合計・試合数）でも読める', () => {
  const text = '選手名\t合計\t試合数\n鈴木\t10.5\t4';
  const { players } = parseStandings(text);
  assert.deepEqual(players, [{ rank: 1, name: '鈴木', total: 10.5, games: 4 }]);
});

test('順位列が無ければ貼った順に採番する', () => {
  const text = '登録名\tトータル\n鈴木\t10\n高橋\t5';
  const { players } = parseStandings(text);
  assert.deepEqual(players.map(p => p.rank), [1, 2]);
});

test('対局数列が無ければ games は null', () => {
  const { players } = parseStandings('登録名\tトータル\n鈴木\t10');
  assert.equal(players[0].games, null);
});

test('空行・名前なし・pt が数値でない行は飛ばす', () => {
  const text = [
    '順位\t登録名\tトータル',
    '',
    '1\t鈴木\t10',
    '2\t\t5',
    '3\t高橋\t—',
    '   \t   \t   ',
    '4\t田中\t-3',
  ].join('\n');
  const { players } = parseStandings(text);
  assert.deepEqual(players.map(p => p.name), ['鈴木', '田中']);
  assert.deepEqual(players.map(p => p.rank), [1, 4]);
});

test('CRLF 改行でも読める', () => {
  const { players } = parseStandings('登録名\tトータル\r\n鈴木\t1\r\n高橋\t2\r\n');
  assert.equal(players.length, 2);
});

test('必須の見出しが無ければ ParseError', () => {
  assert.throws(() => parseStandings('組\t対局数\nA\t20'), ParseError);
  assert.throws(() => parseStandings('登録名\t対局数\n鈴木\t20'), ParseError);
});

test('空文字・見出しだけなら ParseError', () => {
  assert.throws(() => parseStandings(''), ParseError);
  assert.throws(() => parseStandings('   \n\n'), ParseError);
  assert.throws(() => parseStandings('登録名\tトータル'), ParseError);
});

test('parseNumber: カンマ・符号・全角・▲', () => {
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('+12.3'), 12.3);
  assert.equal(parseNumber(' -7 '), -7);
  assert.equal(parseNumber('－5'), -5);
  assert.equal(parseNumber('−5'), -5);
  assert.equal(parseNumber('▲5'), -5);
  assert.equal(parseNumber('△2.5'), -2.5);
  assert.equal(parseNumber('１２３'), 123);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber(undefined)));
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `cd /e/league-card && npm test`
Expected: FAIL（`Cannot find module '../js/parse.js'`）

- [ ] **Step 4: parse.js を実装**

`js/parse.js`:

```js
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

export function parseStandings(text) {
  const rows = splitRows(text);
  if (rows.length === 0) throw new ParseError('貼り付け内容が空です');
  const cols = findColumns(rows[0]);
  if (cols.name === undefined || cols.total === undefined) {
    throw new ParseError('「登録名」「トータル」の見出しが見つかりません。見出し行を含めてコピーしてください');
  }
  const players = [];
  for (const row of rows.slice(1)) {
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
```

- [ ] **Step 5: テストが通ることを確認**

Run: `cd /e/league-card && npm test`
Expected: すべて PASS（9 tests）

- [ ] **Step 6: コミット**

```bash
cd /e/league-card && git add package.json js/parse.js test/parse.test.js && git commit -m "feat: TSV パーサー（見出しで列判定・数値変換・行スキップ）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Canvas 描画（render.js）

**Files:**
- Create: `js/render.js`
- Create: `test/render.test.js`

**Interfaces:**
- Consumes: Task 1 の `players` 配列（`{ rank, name, total, games }`）
- Produces:
  - `renderStandings(data: { players }, settings: { title, session, totalSessions, totalGames, promote, demote, color }): HTMLCanvasElement`（1600×900）
  - `zoneOf(rank: number, playerCount: number, promote: number, demote: number): 'up' | 'stay' | 'down'`
  - `fmtPt(v: number): string` — `+374.9` / `-14.7` / `+0.0`
  - `layoutFor(n: number): { cols: number, rows: number }`
  - `export const W = 1600, H = 900`
- 注意: `render.js` はモジュール読み込み時に `document` を触らない（Node のテストから import するため）

- [ ] **Step 1: 純粋ヘルパーの失敗するテストを書く**

`test/render.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneOf, fmtPt, layoutFor, W, H } from '../js/render.js';

test('zoneOf: 上位は up、下位は down、間は stay', () => {
  assert.equal(zoneOf(1, 22, 3, 8), 'up');
  assert.equal(zoneOf(3, 22, 3, 8), 'up');
  assert.equal(zoneOf(4, 22, 3, 8), 'stay');
  assert.equal(zoneOf(14, 22, 3, 8), 'stay');
  assert.equal(zoneOf(15, 22, 3, 8), 'down');
  assert.equal(zoneOf(22, 22, 3, 8), 'down');
});

test('zoneOf: 0 人なら全員 stay', () => {
  assert.equal(zoneOf(1, 10, 0, 0), 'stay');
  assert.equal(zoneOf(10, 10, 0, 0), 'stay');
});

test('fmtPt: 符号付き小数1桁', () => {
  assert.equal(fmtPt(374.9), '+374.9');
  assert.equal(fmtPt(-14.7), '-14.7');
  assert.equal(fmtPt(0), '+0.0');
  assert.equal(fmtPt(-0.04), '+0.0');
  assert.equal(fmtPt(12), '+12.0');
});

test('layoutFor: 24人以下は3列、25人以上は4列', () => {
  assert.deepEqual(layoutFor(22), { cols: 3, rows: 8 });
  assert.deepEqual(layoutFor(24), { cols: 3, rows: 8 });
  assert.deepEqual(layoutFor(25), { cols: 4, rows: 7 });
  assert.deepEqual(layoutFor(36), { cols: 4, rows: 9 });
  assert.deepEqual(layoutFor(1), { cols: 3, rows: 1 });
});

test('キャンバスサイズは 1600×900', () => {
  assert.equal(W, 1600);
  assert.equal(H, 900);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `cd /e/league-card && npm test`
Expected: render.test.js が FAIL（`Cannot find module '../js/render.js'`）。parse.test.js は PASS のまま

- [ ] **Step 3: render.js を実装**

`js/render.js`:

```js
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `cd /e/league-card && npm test`
Expected: すべて PASS（parse 9 + render 5）

- [ ] **Step 5: コミット**

```bash
cd /e/league-card && git add js/render.js test/render.test.js && git commit -m "feat: 順位表の Canvas 描画（バッジ色分け・3/4列自動・フッター）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 画面（index.html / style.css / app.js）とブラウザ確認

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `js/app.js`
- Create: `.claude/launch.json`

**Interfaces:**
- Consumes: `parseStandings`, `ParseError`（Task 1）、`renderStandings`（Task 2）
- Produces: 公開する画面そのもの。DOM の id は `paste` `message` `title` `session` `totalSessions` `totalGames` `promote` `demote` `color` `copy` `download` `flash` `preview`

- [ ] **Step 1: index.html を作る**

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>リーグ順位表 画像ジェネレーター</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="top">
    <h1>リーグ順位表 画像ジェネレーター</h1>
    <p>スプレッドシートで「順位／組／登録名／トータル／対局数」を<strong>見出し行ごと</strong>範囲選択してコピー → 下の欄に貼り付け</p>
  </header>
  <main>
    <section class="panel">
      <label for="paste">貼り付け</label>
      <textarea id="paste" rows="6" placeholder="ここに Ctrl+V" spellcheck="false"></textarea>
      <p id="message" class="message"></p>
    </section>
    <section class="panel settings">
      <label>タイトル <input id="title" type="text" placeholder="第51期 日本プロ麻雀協会 A2リーグ"></label>
      <label>節 <input id="session" type="text" placeholder="第9節"></label>
      <label>全節数 <input id="totalSessions" type="number" min="0" inputmode="numeric"></label>
      <label>全回戦数 <input id="totalGames" type="number" min="0" inputmode="numeric"></label>
      <label>昇級 上位 <input id="promote" type="number" min="0" inputmode="numeric"> 名</label>
      <label>降級 下位 <input id="demote" type="number" min="0" inputmode="numeric"> 名</label>
      <label>テーマ色 <input id="color" type="color"></label>
    </section>
    <section class="panel actions">
      <button id="copy" type="button" disabled>画像をコピー</button>
      <button id="download" type="button" disabled>ダウンロード</button>
      <span id="flash" class="flash" role="status"></span>
    </section>
    <section id="preview" class="preview" aria-label="プレビュー"></section>
  </main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css を作る**

```css
:root {
  --bg: #f4f2ee;
  --panel: #ffffff;
  --ink: #26221f;
  --muted: #7a736c;
  --line: #ddd9d1;
  --accent: #7a1f2b;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 16px;
  background: var(--bg);
  color: var(--ink);
  font-family: "Noto Sans JP", "Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.top h1 { font-size: 20px; margin: 0 0 4px; }
.top p { margin: 0 0 16px; color: var(--muted); }
main { max-width: 1100px; margin: 0 auto; display: grid; gap: 12px; }
.panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 16px;
}
.panel > label:first-child { display: block; font-weight: 700; margin-bottom: 6px; }
textarea {
  width: 100%;
  font: 13px/1.4 Consolas, "Courier New", monospace;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 8px;
  resize: vertical;
}
.message { margin: 6px 0 0; color: var(--muted); min-height: 1.5em; }
.message.error { color: #b3452f; }
.settings { display: flex; flex-wrap: wrap; gap: 10px 20px; align-items: center; }
.settings label { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.settings input[type="text"] { width: 280px; }
.settings input[type="number"] { width: 64px; }
.settings input { border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; }
.settings input[type="color"] { width: 44px; height: 32px; padding: 2px; }
.actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
button {
  font: inherit;
  font-weight: 700;
  color: #fff;
  background: var(--accent);
  border: 0;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
}
button:disabled { background: #b8b2aa; cursor: not-allowed; }
.flash { color: var(--muted); }
.preview canvas {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}
```

- [ ] **Step 3: app.js を作る**

```js
// 画面の配線：貼り付け → パース → 描画、設定の保存、コピー／ダウンロード
import { parseStandings, ParseError } from './parse.js';
import { renderStandings } from './render.js';

const STORAGE_KEY = 'league-card.settings';
const DEFAULTS = {
  title: '第○期 日本プロ麻雀協会 ○リーグ',
  session: '第○節',
  totalSessions: 12,
  totalGames: 48,
  promote: 3,
  demote: 4,
  color: '#7a1f2b',
};
const FIELDS = Object.keys(DEFAULTS);

const $ = id => document.getElementById(id);
let canvas = null;
let fontsReady = false;

function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* 保存できなくても動く */ }
}

function readSettings() {
  const s = {};
  for (const k of FIELDS) {
    const el = $(k);
    s[k] = el.type === 'number' ? Number(el.value) : el.value;
  }
  return s;
}

function writeSettings(s) {
  for (const k of FIELDS) $(k).value = s[k];
}

// Google Fonts の読み込みを待つ（失敗してもシステムフォントで描く）
async function ensureFonts() {
  if (fontsReady) return;
  try {
    await Promise.all([
      document.fonts.load('400 40px "Noto Sans JP"'),
      document.fonts.load('700 40px "Noto Sans JP"'),
      document.fonts.load('900 40px "Noto Sans JP"'),
    ]);
  } catch { /* フォールバック */ }
  fontsReady = true;
}

function setMessage(text, isError) {
  const el = $('message');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}

function canCopy() {
  return !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
}

function setButtons(enabled) {
  $('download').disabled = !enabled;
  $('copy').disabled = !enabled || !canCopy();
}

let flashTimer = null;
function flash(text) {
  $('flash').textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { $('flash').textContent = ''; }, 4000);
}

async function update() {
  const settings = readSettings();
  saveSettings(settings);
  const text = $('paste').value;
  if (!text.trim()) {
    canvas = null;
    $('preview').replaceChildren();
    setMessage('スプレッドシートからコピーして貼り付けてください', false);
    setButtons(false);
    return;
  }
  let data;
  try {
    data = parseStandings(text);
  } catch (e) {
    canvas = null;
    $('preview').replaceChildren();
    setMessage(e instanceof ParseError ? e.message : `エラー: ${e.message}`, true);
    setButtons(false);
    return;
  }
  await ensureFonts();
  canvas = renderStandings(data, settings);
  $('preview').replaceChildren(canvas);
  setMessage(`${data.players.length}人を読み込みました`, false);
  setButtons(true);
}

function toBlob() {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('画像を作成できませんでした'))), 'image/png');
  });
}

async function copyImage() {
  if (!canvas) return;
  try {
    const blob = await toBlob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    flash('コピーしました。X の投稿欄に Ctrl+V で貼り付けられます');
  } catch (e) {
    flash(`コピーできませんでした（${e.message}）。ダウンロードをお使いください`);
  }
}

async function downloadImage() {
  if (!canvas) return;
  const blob = await toBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'league-card.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function init() {
  writeSettings(loadSettings());
  $('paste').addEventListener('input', update);
  for (const k of FIELDS) $(k).addEventListener('input', update);
  $('copy').addEventListener('click', copyImage);
  $('download').addEventListener('click', downloadImage);
  if (!canCopy()) $('copy').title = 'このブラウザは画像のクリップボードコピーに対応していません';
  $('paste').focus();
  update();
}

init();
```

- [ ] **Step 4: ローカルサーバー設定を作る**

`.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "league-card",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["serve", "-l", "3456", "."],
      "port": 3456
    }
  ]
}
```

- [ ] **Step 5: ブラウザで確認**

`preview_start` で `league-card` を起動し `http://localhost:3456` を開く。以下の TSV を貼り付け欄に入力（`form_input` で `paste` に設定してから `input` イベントが走ることを確認。走らなければ `javascript_tool` で `document.getElementById('paste').dispatchEvent(new Event('input'))`）:

```
順位	組	登録名	トータル	対局数
1	D	川本 卓弥	333.3	20
2	A	八日市屋 英樹	311.1	20
3	B	笹木 かずあき	295.1	20
4	C	日當 ひな	275.5	20
5	E	石井 伸史	164.9	20
6	E	石原 厳	72.7	20
7	B	九丈 ヤス	56.1	13
8	A	真木 庵里	8.5	20
9	D	皆実 絢音	-26.3	20
10	D	戸沢 耕二	-35.1	20
11	C	赤塚 修	-36.0	20
12	A	崎村 あやか	-54.4	20
13	A	清田 力夫	-65.4	20
14	C	名波 慎一	-65.6	20
15	E	水戸 徹斗	-78.5	20
16	E	中西 正寛	-102.3	20
17	B	与那城 葵	-118.9	20
18	D	秋瀬 ちさと	-122.4	20
19	D	西川 賢大	-148.9	20
20	B	神田 大行	-162.8	20
21	B	橋崎 祐輝	-183.7	20
22	C	都美	-190.8	20
```

確認項目（スクリーンショットで目視）:
- 「22人を読み込みました」と出て、プレビューに 3列×8行 で並ぶ（1〜8 左、9〜16 中央、17〜22 右）
- 昇級 3・降級 4 の初期設定で、1〜3 が青、19〜22 がグレー、間がオレンジ
- 名前・`+333.3` / `-190.8`・`[20/48]` が読める。「八日市屋 英樹」も切れない
- タイトル・節・フッター「全12節・48回戦」が出る
- 設定欄（タイトル・節・色など）を変えると即プレビューが変わる
- 貼り付け欄を空にするとメッセージだけになりボタンが無効になる
- 見出しなしのテキスト（例: `A\t20`）を貼るとエラーメッセージ（赤）が出る
- `read_console_messages` でエラーが無い

見た目が崩れていたら render.js の定数（`BODY_TOP` / `MAX_ROW_H` / フォント比率）を調整して再確認する。

- [ ] **Step 6: テストが通ることを再確認**

Run: `cd /e/league-card && npm test`
Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
cd /e/league-card && git add index.html style.css js/app.js .claude/launch.json && git commit -m "feat: 貼り付け→プレビュー→コピー/ダウンロードの画面

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: README と GitHub Pages 公開

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: Task 3 までの完成物
- Produces: 公開 URL

- [ ] **Step 1: README.md を書く**

````markdown
# リーグ順位表 画像ジェネレーター

Google スプレッドシートの順位表をコピペするだけで、X（旧Twitter）投稿用の順位表画像（1600×900 PNG）を作るツールです。ログイン不要・サーバー不要。

## 使い方

1. スプレッドシートで「順位／組／登録名／トータル／対局数」の **見出し行を含めて** 選手の最終行まで範囲選択し、コピー
2. ページの「貼り付け」欄に Ctrl+V → すぐにプレビューが出ます
3. タイトル・節・全節数・全回戦数・昇級/降級の人数・テーマ色を入力（次回も覚えています）
4. **画像をコピー** → X の投稿欄に Ctrl+V。または **ダウンロード** で PNG を保存

- 列は見出し名で自動判定します（名前: 登録名/選手名/氏名、pt: トータル/合計/累計、対局数: 対局数/試合数）。「組」など他の列は無視されます
- 「順位」列が無ければ貼った順に 1 から番号を振ります
- 24人以下は3列、25人以上は4列で自動整列します

## 開発

```bash
npm test
```

ローカル確認:

```bash
npx serve .
```

## 公開（GitHub Pages）

`main` ブランチのルートを GitHub Pages で公開しています。ファイルを変更して `git push` すれば反映されます。
````

- [ ] **Step 2: コミット**

```bash
cd /e/league-card && git add README.md && git commit -m "docs: README（使い方・公開手順）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: GitHub にリポジトリを作って push（ユーザーに確認してから実行）**

公開操作なので、実行前にユーザーへ「GitHub に `league-card` を public で作って push してよいか」を確認する。承認後:

```bash
cd /e/league-card && gh repo create league-card --public --source=. --push
```

- [ ] **Step 4: GitHub Pages を有効化**

```bash
cd /e/league-card && gh api -X POST "repos/{owner}/league-card/pages" -F 'source[branch]=main' -F 'source[path]=/'
```

Expected: JSON が返り、`html_url` に `https://<owner>.github.io/league-card/` が入る。`gh` が無い／失敗する場合は、GitHub のリポジトリ設定 → Pages → Branch: `main` / `/ (root)` を手動で選ぶ手順をユーザーに案内する。

- [ ] **Step 5: 公開 URL で動作確認**

数分待ってから `navigate` で `https://<owner>.github.io/league-card/` を開き、Task 3 Step 5 と同じ TSV を貼って画像が出ることを確認する。
