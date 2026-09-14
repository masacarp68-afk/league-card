import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zoneOf, fmtPt, layoutFor, splitTitle, footerText, W, H } from '../js/render.js';

test('zoneOf: 上位から金・銀・銅、下位から赤・薄赤、間は stay', () => {
  // 22人：上位1名=金、次2名=銀、次3名=銅／下位4名=赤、その上2名=薄赤
  const ups = [1, 2, 3], downs = [4, 2];
  assert.equal(zoneOf(1, 22, ups, downs), 'up1');
  assert.equal(zoneOf(2, 22, ups, downs), 'up2');
  assert.equal(zoneOf(3, 22, ups, downs), 'up2');
  assert.equal(zoneOf(4, 22, ups, downs), 'up3');
  assert.equal(zoneOf(6, 22, ups, downs), 'up3');
  assert.equal(zoneOf(7, 22, ups, downs), 'stay');
  assert.equal(zoneOf(16, 22, ups, downs), 'stay');
  assert.equal(zoneOf(17, 22, ups, downs), 'down2');
  assert.equal(zoneOf(18, 22, ups, downs), 'down2');
  assert.equal(zoneOf(19, 22, ups, downs), 'down1');
  assert.equal(zoneOf(22, 22, ups, downs), 'down1');
});

test('zoneOf: 1段階だけなら金と赤だけ', () => {
  assert.equal(zoneOf(3, 22, [3, 0, 0], [8, 0]), 'up1');
  assert.equal(zoneOf(4, 22, [3, 0, 0], [8, 0]), 'stay');
  assert.equal(zoneOf(15, 22, [3, 0, 0], [8, 0]), 'down1');
});

test('zoneOf: 0 人なら全員 stay', () => {
  assert.equal(zoneOf(1, 10, [0, 0, 0], [0, 0]), 'stay');
  assert.equal(zoneOf(10, 10, [0, 0, 0], [0, 0]), 'stay');
});

test('fmtPt: プラスは +、マイナスは ▲、小数1桁', () => {
  assert.equal(fmtPt(374.9), '+374.9');
  assert.equal(fmtPt(-14.7), '▲14.7');
  assert.equal(fmtPt(0), '+0.0');
  assert.equal(fmtPt(-0.04), '+0.0');
  assert.equal(fmtPt(12), '+12.0');
});

test('layoutFor: 26人以下は3列、48人以下は4列、それ以上は5列', () => {
  assert.deepEqual(layoutFor(22), { cols: 3, rows: 8 });
  assert.deepEqual(layoutFor(26), { cols: 3, rows: 9 });
  assert.deepEqual(layoutFor(27), { cols: 4, rows: 7 });
  assert.deepEqual(layoutFor(32), { cols: 4, rows: 8 });
  assert.deepEqual(layoutFor(48), { cols: 4, rows: 12 });
  assert.deepEqual(layoutFor(50), { cols: 5, rows: 10 });
  assert.deepEqual(layoutFor(1), { cols: 3, rows: 1 });
});

test('splitTitle: 【 】で囲んだ部分を gold にする', () => {
  assert.deepEqual(splitTitle('第24期 雀王戦【A2】リーグ'), [
    { text: '第24期 雀王戦', gold: false },
    { text: 'A2', gold: true },
    { text: 'リーグ', gold: false },
  ]);
  assert.deepEqual(splitTitle('【B1】'), [{ text: 'B1', gold: true }]);
  assert.deepEqual(splitTitle('囲みなし'), [{ text: '囲みなし', gold: false }]);
  assert.deepEqual(splitTitle(''), []);
});

test('キャンバスサイズは 1920×1080', () => {
  assert.equal(W, 1920);
  assert.equal(H, 1080);
});

test('footerText: 節と回戦、節が無ければ「全○回戦」、両方無ければ空', () => {
  assert.equal(footerText(12, 48), '全12節・48回戦');
  assert.equal(footerText(0, 6), '全6回戦');
  assert.equal(footerText(12, 0), '全12節');
  assert.equal(footerText(0, 0), '');
  assert.equal(footerText('', ''), '');
});
