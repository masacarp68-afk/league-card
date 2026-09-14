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
