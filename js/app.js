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
