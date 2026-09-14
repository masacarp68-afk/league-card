# 雀竜位戦モード 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 雀竜位戦のスプレッドシート（登録名／ポイント＋各回戦の得失点・順位・合計点）を貼り付けて、既存と同じデザインの順位表画像を作れる「雀竜位戦」モードを追加し、リーグ戦と画面で切り替えられるようにする。

**Architecture:** 描画（`js/render.js` の `renderStandings`）はそのまま流用。`js/parse.js` に雀竜位戦用パーサー `parseJantoryu` を足し（各回戦の「順位」列を無視し、ポイント降順で順位付け、得失点セルの数を対局数にする）、`js/app.js` にモード切替とモードごとの設定保存を入れる。画面は `index.html` にラジオボタンと案内文を追加。

**Tech Stack:** 静的 HTML / ES Modules / Canvas。テストは `node --test`（`npm test`）。依存ライブラリなし。

**Spec:** `docs/superpowers/specs/2026-09-15-jantoryu-mode-design.md`

## Global Constraints

- 依存ライブラリを追加しない。静的ファイルのみ（GitHub Pages で公開）
- コメント・UI 文言・コミットメッセージは日本語。既存コードのコメント密度に合わせる
- リーグ戦の localStorage キー `league-card.settings` は変えない（既存ユーザーの設定を保持）
- 雀竜位戦の設定キーは `league-card.settings.jantoryu`、モードのキーは `league-card.mode`
- パーサーの出力形は既存と同じ `{ players: [{ rank, name, total, games }] }`
- コミットの末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

---

## ファイル構成

- `js/parse.js` … 見出し行の探索を `findHeaderRow` に共通化。`parseJantoryu`・`rankByTotal` を追加
- `js/render.js` … フッター文言を `footerText` に切り出し、節が無いときは「全6回戦」
- `js/app.js` … `MODES` 定義、モードごとの `loadSettings/saveSettings`、`switchMode`、`applyModeUI`
- `index.html` / `style.css` … モード切替ラジオ、モード別の案内文、色分け見出しに id
- `test/parse.test.js` / `test/render.test.js` … テスト追加
- `README.md` … 雀竜位戦の使い方

---

### Task 1: 見出し行が先頭でなくても読めるようにする（`parseStandings`）

**Files:**
- Modify: `js/parse.js`
- Test: `test/parse.test.js`

**Interfaces:**
- Produces: `findHeaderRow(rows, requiredPatterns) → number`（モジュール内関数。必須見出しが揃った行の添字。無ければ -1。先頭5行だけ探す）。Task 2 の `parseJantoryu` が使う

- [ ] **Step 1: 失敗するテストを書く**

`test/parse.test.js` の末尾に追加：

```js
test('parseStandings: 見出し行の上に余計な行があっても読める', () => {
  const text = [
    '\t\t①\t②',
    '順位\t登録名\tトータル\t対局数',
    '1\t宇野 公介\t374.9\t32',
    '2\t中野 妃彩\t250.2\t32',
  ].join('\n');
  const { players } = parseStandings(text);
  assert.equal(players.length, 2);
  assert.equal(players[0].name, '宇野 公介');
  assert.equal(players[0].rank, 1);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: 上のテストが FAIL（「登録名」「トータル」の見出しが見つかりません）

- [ ] **Step 3: 実装**

`js/parse.js` の `findColumns` の下に追加し、`parseStandings` を書き換える：

```js
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS（既存テストも含む）

- [ ] **Step 5: コミット**

```bash
git add js/parse.js test/parse.test.js
git commit -m "feat: 見出し行が先頭でなくても読めるように（先頭5行から探す）"
```

---

### Task 2: 雀竜位戦パーサー `parseJantoryu`

**Files:**
- Modify: `js/parse.js`
- Test: `test/parse.test.js`

**Interfaces:**
- Consumes: `findHeaderRow`（Task 1）、`splitRows`、`parseNumber`、`ParseError`
- Produces:
  - `export function parseJantoryu(text) → { players: [{ rank, name, total, games }] }`（ポイント降順、同点は同順位、`games` は得失点に数値が入っている回戦の数。得失点列が無ければ `null`）
  - `export function rankByTotal(players) → players`（`{ name, total, games }` の配列をポイント降順に並べ替えて `rank` を付ける。同点は 1, 2, 2, 4 方式）
  - Task 4 の `app.js` が `parseJantoryu` を import する

- [ ] **Step 1: 失敗するテストを書く**

`test/parse.test.js` の既存 import に `parseJantoryu` を足し、末尾に追加：

```js
// 見本（雀竜位戦のシート）。①〜⑥の行、各回戦の 得失点／順位／合計点、供託・check sum 行つき
// ポイント順に並んでいない（稀木 -156.8 が 野口 -110.9 より上）
const JANTORYU_SAMPLE = [
  '\t\t\t①\t\t\t②\t\t\t③\t\t\t④\t\t\t⑤\t\t\t⑥\t\t',
  '\t登録名\tポイント\t得失点\t順位\t合計点\t得失点\t順位\t合計点\t得失点\t順位\t合計点\t得失点\t順位\t合計点\t得失点\t順位\t合計点\t得失点\t順位\t合計点\t⑥',
  '1\t森 昌弘\t177.5\t13.6\t1\t63.6\t-4.6\t3\t-14.6\t11.5\t1\t61.5\t10.5\t1\t60.5\t-3.5\t2\t6.5\t\t\t0.0\t',
  '2\t速水 あいり\t90.6\t7.2\t2\t17.2\t5.4\t1\t55.4\t-5.1\t3\t-15.1\t-6.9\t3\t-16.9\t11.8\t1\t61.8\t-1.8\t3\t-11.8\t1',
  '3\t稀木 深文\t-156.8\t-33.8\t4\t-63.8\t-7.3\t2\t2.7\t12.6\t1\t62.6\t-14.7\t4\t-44.7\t-28.3\t4\t-58.3\t-25.3\t4\t-55.3\t1',
  '4\t野口 太郎\t-110.9\t-41.2\t4\t-71.2\t1.4\t1\t51.4\t-53.4\t4\t-83.4\t-9.2\t3\t-19.2\t1.5\t2\t11.5\t\t\t0.0\t',
  '\t\t供託\t2\t---\t\t2\t3\t---\t\t3\t\t---\t\t\t\t---\t\t1\t\t1\t---',
  '\t\tcheck sum\tok\t\tok\t\tok\t\tok\t\tok\t\tok\t\tok\t\tok\t\tok\t\tok\t\tok',
].join('\n');

test('parseJantoryu: ポイントの高い順に並べ替えて順位を付け、得失点の数を対局数にする', () => {
  const { players } = parseJantoryu(JANTORYU_SAMPLE);
  assert.deepEqual(players, [
    { rank: 1, name: '森 昌弘', total: 177.5, games: 5 },
    { rank: 2, name: '速水 あいり', total: 90.6, games: 6 },
    { rank: 3, name: '野口 太郎', total: -110.9, games: 5 },
    { rank: 4, name: '稀木 深文', total: -156.8, games: 6 },
  ]);
});

test('parseJantoryu: 同点は同順位（1, 2, 2, 4）', () => {
  const text = [
    '登録名\tポイント\t得失点',
    'A\t10\t1',
    'B\t20\t1',
    'C\t20\t1',
    'D\t30\t1',
  ].join('\n');
  const { players } = parseJantoryu(text);
  assert.deepEqual(players.map(p => [p.rank, p.name]), [[1, 'D'], [2, 'B'], [2, 'C'], [4, 'A']]);
});

test('parseJantoryu: 「合計点」をポイントと間違えない', () => {
  const text = ['登録名\t合計\t得失点\t順位\t合計点', 'A\t50\t10\t1\t60'].join('\n');
  assert.equal(parseJantoryu(text).players[0].total, 50);
  assert.throws(() => parseJantoryu('登録名\t合計点\nA\t60'), ParseError);
});

test('parseJantoryu: 得失点の列が無ければ対局数は null', () => {
  const { players } = parseJantoryu('登録名\tポイント\nA\t12.5');
  assert.deepEqual(players, [{ rank: 1, name: 'A', total: 12.5, games: null }]);
});

test('parseJantoryu: 必須列が無ければ ParseError', () => {
  assert.throws(() => parseJantoryu(''), ParseError);
  assert.throws(() => parseJantoryu('順位\t名前\n1\tA'), ParseError);
  assert.throws(() => parseJantoryu('登録名\tポイント\n\t'), ParseError);
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: `parseJantoryu is not a function` 系で FAIL

- [ ] **Step 3: 実装**

`js/parse.js` の先頭の定数を次のように整理（`HEADER_PATTERNS.name` を共有）：

```js
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
```

ファイル末尾に追加：

```js
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 5: コミット**

```bash
git add js/parse.js test/parse.test.js
git commit -m "feat: 雀竜位戦のシート用パーサー（ポイント順に順位付け・得失点の数を対局数に）"
```

---

### Task 3: フッター「全6回戦」表記（`footerText`）

**Files:**
- Modify: `js/render.js`（`drawFooter`）
- Test: `test/render.test.js`

**Interfaces:**
- Produces: `export function footerText(totalSessions, totalGames) → string`（「全12節・48回戦」／節が0なら「全6回戦」／両方0なら `''`）

- [ ] **Step 1: 失敗するテストを書く**

`test/render.test.js` の import に `footerText` を足し、末尾に追加：

```js
test('footerText: 節と回戦、節が無ければ「全○回戦」、両方無ければ空', () => {
  assert.equal(footerText(12, 48), '全12節・48回戦');
  assert.equal(footerText(0, 6), '全6回戦');
  assert.equal(footerText(12, 0), '全12節');
  assert.equal(footerText(0, 0), '');
  assert.equal(footerText('', ''), '');
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: `footerText` 未定義で FAIL

- [ ] **Step 3: 実装**

`js/render.js` の `drawFooter` を次に置き換える：

```js
// フッターの文言。「全12節・48回戦」、節が無ければ「全6回戦」、どちらも無ければ ''
export function footerText(totalSessions, totalGames) {
  const sessions = Number(totalSessions) || 0;
  const games = Number(totalGames) || 0;
  const parts = [];
  if (sessions) parts.push(`全${sessions}節`);
  if (games) parts.push(`${sessions ? '' : '全'}${games}回戦`);
  return parts.join('・');
}

function drawFooter(ctx, s) {
  const text = footerText(s.totalSessions, s.totalGames);
  if (!text) return;
  ctx.fillStyle = COLORS.footer;
  ctx.font = `700 24px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, W - MARGIN, H - 22);
  ctx.textAlign = 'left';
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test`
Expected: 全て PASS

- [ ] **Step 5: コミット**

```bash
git add js/render.js test/render.test.js
git commit -m "feat: フッターは節が無ければ「全6回戦」と表記"
```

---

### Task 4: モード切替 UI とモードごとの設定保存

**Files:**
- Modify: `index.html`, `style.css`, `js/app.js`

**Interfaces:**
- Consumes: `parseStandings`, `parseJantoryu`（Task 2）
- Produces: 画面のラジオ `input[name="mode"]`（値 `league` / `jantoryu`）、案内文 `p.guide[data-mode]`、見出し `#upTitle` / `#downTitle`

- [ ] **Step 1: `index.html` を書き換える**

`<title>` と `<header>` を次に：

```html
  <title>順位表 画像ジェネレーター</title>
```

```html
  <header class="top">
    <h1>順位表 画像ジェネレーター</h1>
    <div class="mode" role="radiogroup" aria-label="種別">
      <label><input type="radio" name="mode" value="league"> リーグ戦</label>
      <label><input type="radio" name="mode" value="jantoryu"> 雀竜位戦</label>
    </div>
    <p class="guide" data-mode="league">スプレッドシートで「順位／組／登録名／トータル／対局数」を<strong>見出し行ごと</strong>範囲選択してコピー → 下の欄に貼り付け</p>
    <p class="guide" data-mode="jantoryu" hidden>スプレッドシートで「登録名／ポイント」を<strong>見出し行ごと</strong>範囲選択してコピー（各回戦の列が混ざっていてOK）→ 下の欄に貼り付け</p>
  </header>
```

色分けの見出し2か所に id を付ける：

```html
        <span class="zones-title" id="upTitle">昇級（上位から）</span>
```
```html
        <span class="zones-title" id="downTitle">降級（下位から）</span>
```

- [ ] **Step 2: `style.css` にラジオの見た目を足す**

`.top p { ... }` の下に追加：

```css
.mode { display: flex; gap: 18px; margin: 0 0 8px; }
.mode label { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; cursor: pointer; }
.mode input { width: 16px; height: 16px; margin: 0; }
```

- [ ] **Step 3: `js/app.js` を書き換える**

import・定数・設定の読み書き部分（ファイル先頭から `writeSettings` まで）を次に置き換える：

```js
// 画面の配線：貼り付け → パース → 描画、設定の保存、コピー／ダウンロード
import { parseStandings, parseJantoryu, ParseError } from './parse.js';
import { renderStandings } from './render.js';

const MODE_KEY = 'league-card.mode';
// ロゴは assets/logo.(webp|png|jpg) のどれかを置く。先に見つかったものを使う
const LOGO_URLS = ['assets/logo.webp', 'assets/logo.png', 'assets/logo.jpg'];

// 背景のテーマ。色ピッカーを直接いじると「カスタム」になる
const THEMES = [
  { id: 'navy', label: '星空ネイビー', color: '#1c2f7a' },
  { id: 'crimson', label: 'えんじ', color: '#8a2333' },
  { id: 'pink', label: 'ピンク', color: '#ee62aa' },
  { id: 'green', label: '深緑', color: '#1a5c45' },
  { id: 'purple', label: 'パープル', color: '#4a1f7a' },
  { id: 'black', label: 'ブラック', color: '#3a3a3a' },
  { id: 'custom', label: 'カスタム', color: null },
];

// リーグ戦／雀竜位戦。設定はモードごとに別のキーに保存する（リーグ戦は旧来のキーのまま）
const MODES = {
  league: {
    storageKey: 'league-card.settings',
    parse: parseStandings,
    upTitle: '昇級（上位から）',
    downTitle: '降級（下位から）',
    defaults: { title: '第○期 日本プロ麻雀協会【A○】リーグ', session: '第○節', totalSessions: 12, totalGames: 48, promote1: 3, demote1: 4 },
  },
  jantoryu: {
    storageKey: 'league-card.settings.jantoryu',
    parse: parseJantoryu,
    upTitle: '通過（上位から）',
    downTitle: '敗退（下位から）',
    defaults: { title: '第○期 雀竜位戦【○次予選】', session: '○回戦終了時', totalSessions: 0, totalGames: 6, promote1: 4, demote1: 4 },
  },
};
// モード共通の初期値
const COMMON_DEFAULTS = { promote2: 0, promote3: 0, demote2: 0, theme: 'navy', color: '#1c2f7a', showGames: true };
const FIELDS = ['title', 'session', 'totalSessions', 'totalGames', 'promote1', 'promote2', 'promote3', 'demote1', 'demote2', 'theme', 'color', 'showGames'];

const $ = id => document.getElementById(id);
let mode = 'league';
let canvas = null;
let fontsReady = false;
let logo = null;

function loadMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    if (MODES[m]) return m;
  } catch { /* 初期値 */ }
  return 'league';
}

function saveMode(m) {
  try { localStorage.setItem(MODE_KEY, m); } catch { /* 保存できなくても動く */ }
}

function loadSettings(m) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(MODES[m].storageKey) || '{}'); } catch { /* 壊れていれば初期値 */ }
  // 旧形式（昇級 promote／降級 demote の1段階）は金・赤に引き継ぐ
  if (saved.promote !== undefined && saved.promote1 === undefined) saved.promote1 = saved.promote;
  if (saved.demote !== undefined && saved.demote1 === undefined) saved.demote1 = saved.demote;
  const s = { ...COMMON_DEFAULTS, ...MODES[m].defaults };
  for (const k of FIELDS) if (saved[k] !== undefined) s[k] = saved[k];
  return s;
}

function saveSettings(m, s) {
  try { localStorage.setItem(MODES[m].storageKey, JSON.stringify(s)); } catch { /* 保存できなくても動く */ }
}

function readSettings() {
  const s = {};
  for (const k of FIELDS) {
    const el = $(k);
    if (el.type === 'checkbox') s[k] = el.checked;
    else if (el.type === 'number') s[k] = Number(el.value);
    else s[k] = el.value;
  }
  return s;
}

function writeSettings(s) {
  for (const k of FIELDS) {
    const el = $(k);
    if (el.type === 'checkbox') el.checked = !!s[k];
    else el.value = s[k];
  }
}

// モードに合わせて案内文・色分けの見出し・ラジオの選択を切り替える
function applyModeUI() {
  for (const el of document.querySelectorAll('.guide[data-mode]')) el.hidden = el.dataset.mode !== mode;
  $('upTitle').textContent = MODES[mode].upTitle;
  $('downTitle').textContent = MODES[mode].downTitle;
  for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === mode;
}

// モードを切り替えて、そのモードの設定を入力欄に戻し、貼り付け内容を読み直す
function switchMode(m) {
  if (!MODES[m] || m === mode) return;
  mode = m;
  saveMode(mode);
  writeSettings(loadSettings(mode));
  applyModeUI();
  update();
}
```

`update()` の中の2か所を変える：

```js
  const settings = readSettings();
  saveSettings(mode, settings);
```
```js
  try {
    data = MODES[mode].parse(text);
  } catch (e) {
```

`init()` を次に：

```js
function init() {
  initThemeSelect();
  mode = loadMode();
  writeSettings(loadSettings(mode));
  applyModeUI();
  loadLogo();
  $('paste').addEventListener('input', update);
  for (const k of FIELDS) $(k).addEventListener('input', update);
  for (const r of document.querySelectorAll('input[name="mode"]')) {
    r.addEventListener('change', () => switchMode(r.value));
  }
  $('copy').addEventListener('click', copyImage);
  $('download').addEventListener('click', downloadImage);
  if (!canCopy()) $('copy').title = 'このブラウザは画像のクリップボードコピーに対応していません';
  $('paste').focus();
  update();
}
```

- [ ] **Step 4: テストとブラウザで確認**

Run: `npm test` → 全て PASS

ブラウザ（`.claude/launch.json` の `league-card`、`http://localhost:3456`）で：
1. 「雀竜位戦」を選ぶ → 案内文が変わり、見出しが「通過／敗退」、タイトル欄が `第○期 雀竜位戦【○次予選】` になる
2. Task 2 の `JANTORYU_SAMPLE` 相当（16人分でもよい）をタブ区切りで貼る → ポイント順に並んだプレビューが出て、対局数が `5/6` `6/6` と出る
3. タイトルを変えて「リーグ戦」に戻す → リーグ戦のタイトルが残っている。再び「雀竜位戦」→ 変えたタイトルが残っている
4. リロードしても選んだモードが残る
5. コンソールにエラーが無い

- [ ] **Step 5: コミット**

```bash
git add index.html style.css js/app.js
git commit -m "feat: リーグ戦／雀竜位戦のモード切替（設定はモードごとに保存）"
```

---

### Task 5: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README を更新**

タイトルと冒頭を：

```markdown
# 順位表 画像ジェネレーター

Google スプレッドシートの順位表をコピペするだけで、X（旧Twitter）投稿用の順位表画像（1920×1080 PNG）を作るツールです。ログイン不要・サーバー不要。リーグ戦と雀竜位戦に対応。
```

「## 使い方」の直後（手順1の前）に：

```markdown
まず上部の **リーグ戦／雀竜位戦** を選びます（設定はそれぞれ別に記憶されます）。
```

「## ロゴ」の前に節を追加：

```markdown
## 雀竜位戦

1. スプレッドシートで「登録名／ポイント」の **見出し行を含めて** 選手の最終行まで範囲選択し、コピー（各回戦の「得失点／順位／合計点」の列が混ざっていて構いません）
2. 貼り付けると **ポイントの高い順に並べ替えて順位を付けます**（同点は同順位）。各回戦の「順位」（着順）は無視します
3. 対局数は「得失点」に数値が入っている回戦の数です。「全回戦数」を 6 にすると `5/6` のように出ます
4. 色分けは「通過（上位から）」「敗退（下位から）」に人数を入れます。「全節数」を 0 にするとフッターは「全6回戦」だけになります
5. 「供託」「check sum」の行は自動で読み飛ばします
```

- [ ] **Step 2: コミット**

```bash
git add README.md
git commit -m "docs: 雀竜位戦の使い方"
```
