// 画面の配線：貼り付け → パース → 描画、設定の保存、コピー／ダウンロード
import { parseStandings, parseJantoryu, parseFreshStar, ParseError } from './parse.js';
import { renderStandings } from './render.js';

const MODE_KEY = 'league-card.mode';
// ロゴは assets/logo.(webp|png|jpg) のどれかを置く。先に見つかったものを使う
const LOGO_URLS = ['assets/logo.webp', 'assets/logo.png', 'assets/logo.jpg'];

// 背景のテーマ。色ピッカーを直接いじると「カスタム」になる
const THEMES = [
  { id: 'navy', label: 'ネイビー', color: '#1c2f7a' },
  { id: 'crimson', label: 'えんじ', color: '#8a2333' },
  { id: 'pink', label: 'ピンク', color: '#ee62aa' },
  { id: 'green', label: '深緑', color: '#1a5c45' },
  { id: 'purple', label: 'パープル', color: '#4a1f7a' },
  { id: 'black', label: 'ブラック', color: '#3a3a3a' },
  { id: 'custom', label: 'カスタム', color: null },
];

// リーグ戦／雀竜位戦／フレッシュスターカップ。設定とロゴはモードごと（リーグ戦の設定キーは旧来のまま）
const MODES = {
  league: {
    storageKey: 'league-card.settings',
    parse: parseStandings,
    logoUrls: LOGO_URLS,
    upTitle: '昇級（上位から）',
    downTitle: '降級（下位から）',
    defaults: { title: '第○期 日本プロ麻雀協会 【A○】リーグ', session: '第○節', totalSessions: 12, totalGames: 48, promote1: 3, demote1: 4 },
  },
  jantoryu: {
    storageKey: 'league-card.settings.jantoryu',
    parse: parseJantoryu,
    logoUrls: LOGO_URLS,
    upTitle: '通過（上位から）',
    downTitle: '敗退（下位から）',
    defaults: { title: '第○期 雀竜位戦【○次予選】', session: '○回戦終了時', totalSessions: 0, totalGames: 6, promote1: 4, demote1: 4 },
  },
  freshstar: {
    storageKey: 'league-card.settings.freshstar',
    parse: parseFreshStar,
    logoUrls: ['assets/logo-freshstar.png'],
    upTitle: '入賞（上位から）',
    downTitle: '下位（下位から）',
    defaults: { title: '第○回 フレッシュスターカップ', session: '最終結果', totalSessions: 0, totalGames: 5, promote1: 1, promote2: 1, promote3: 1, demote1: 0 },
  },
};
// モード共通の初期値
const COMMON_DEFAULTS = { promote2: 0, promote3: 0, demote2: 0, theme: 'navy', color: '#1c2f7a', showGames: true };
const FIELDS = ['title', 'session', 'totalSessions', 'totalGames', 'promote1', 'promote2', 'promote3', 'demote1', 'demote2', 'theme', 'color', 'showGames'];

const $ = id => document.getElementById(id);
let mode = 'league';
let canvas = null;
let fontsReady = false;
// モードごとのロゴ画像。undefined = 未読み込み、null = 無し
const logos = {};

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
  loadLogo(mode);
  update();
}

function initThemeSelect() {
  const sel = $('theme');
  for (const t of THEMES) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    const t = THEMES.find(x => x.id === sel.value);
    if (t && t.color) $('color').value = t.color;
    update();
  });
  $('color').addEventListener('input', () => { sel.value = 'custom'; });
}

// そのモードのロゴを読み込んで再描画。候補のどれも無ければロゴ無しで描く（一度読んだら使い回す）
function loadLogo(m) {
  if (m in logos) return;
  logos[m] = null; // 読み込み中はロゴ無しで描く
  const urls = MODES[m].logoUrls;
  const tryAt = i => {
    if (i >= urls.length) return;
    const img = new Image();
    img.onload = () => { logos[m] = img; if (m === mode) update(); };
    img.onerror = () => tryAt(i + 1);
    img.src = urls[i];
  };
  tryAt(0);
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
  saveSettings(mode, settings);
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
    data = MODES[mode].parse(text);
  } catch (e) {
    canvas = null;
    $('preview').replaceChildren();
    setMessage(e instanceof ParseError ? e.message : `エラー: ${e.message}`, true);
    setButtons(false);
    return;
  }
  await ensureFonts();
  canvas = renderStandings(data, settings, { logo: logos[mode] || null });
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
  initThemeSelect();
  mode = loadMode();
  writeSettings(loadSettings(mode));
  applyModeUI();
  loadLogo(mode);
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

init();
