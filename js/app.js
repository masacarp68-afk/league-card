// 画面の配線：貼り付け → パース → 描画、設定の保存、コピー／ダウンロード
import { parseStandings, ParseError } from './parse.js';
import { renderStandings } from './render.js';

const STORAGE_KEY = 'league-card.settings';
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

const DEFAULTS = {
  title: '第○期 日本プロ麻雀協会【A○】リーグ',
  session: '第○節',
  totalSessions: 12,
  totalGames: 48,
  promote1: 3,
  promote2: 0,
  promote3: 0,
  demote1: 4,
  demote2: 0,
  theme: 'navy',
  color: '#1c2f7a',
  showGames: true,
};
const FIELDS = Object.keys(DEFAULTS);

const $ = id => document.getElementById(id);
let canvas = null;
let fontsReady = false;
let logo = null;

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { /* 壊れていれば初期値 */ }
  // 旧形式（昇級 promote／降級 demote の1段階）は金・赤に引き継ぐ
  if (saved.promote !== undefined && saved.promote1 === undefined) saved.promote1 = saved.promote;
  if (saved.demote !== undefined && saved.demote1 === undefined) saved.demote1 = saved.demote;
  const s = { ...DEFAULTS };
  for (const k of FIELDS) if (saved[k] !== undefined) s[k] = saved[k];
  return s;
}

function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* 保存できなくても動く */ }
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

// ロゴがあれば読み込んで再描画。どれも無ければロゴ無しで描く
function loadLogo(i = 0) {
  if (i >= LOGO_URLS.length) { logo = null; return; }
  const img = new Image();
  img.onload = () => { logo = img; update(); };
  img.onerror = () => loadLogo(i + 1);
  img.src = LOGO_URLS[i];
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
  canvas = renderStandings(data, settings, { logo });
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
  writeSettings(loadSettings());
  loadLogo();
  $('paste').addEventListener('input', update);
  for (const k of FIELDS) $(k).addEventListener('input', update);
  $('copy').addEventListener('click', copyImage);
  $('download').addEventListener('click', downloadImage);
  if (!canCopy()) $('copy').title = 'このブラウザは画像のクリップボードコピーに対応していません';
  $('paste').focus();
  update();
}

init();
