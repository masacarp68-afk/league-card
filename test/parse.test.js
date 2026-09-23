import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStandings, parseNumber, parseJantoryu, parseFreshStar, ParseError } from '../js/parse.js';

const SAMPLE = [
  '順位\t組\t登録名\tトータル\t対局数',
  '1\tD\t山田 太郎\t333.3\t20',
  '2\tA\t佐藤 花子\t-26.3\t13',
].join('\n');

test('見出しから列を判定して選手を読む', () => {
  const { players } = parseStandings(SAMPLE);
  assert.deepEqual(players, [
    { rank: 1, name: '山田 太郎', total: 333.3, games: 20, latest: null },
    { rank: 2, name: '佐藤 花子', total: -26.3, games: 13, latest: null },
  ]);
});

test('見出しの揺れ（選手名・合計・試合数）でも読める', () => {
  const text = '選手名\t合計\t試合数\n鈴木\t10.5\t4';
  const { players } = parseStandings(text);
  assert.deepEqual(players, [{ rank: 1, name: '鈴木', total: 10.5, games: 4, latest: null }]);
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

// 見本（フレッシュスターカップのシート）。順位／氏名／入会期／合計 のあとに 1回戦〜決勝
// 順位はシートの列をそのまま使う（決勝の結果順。合計順ではない）
const FRESHSTAR_SAMPLE = [
  '順位\t氏名\t入会期\t合計\t1回戦\t2回戦\t3回戦\t準決勝\t決勝',
  '1\t結宮れちょ\t6期生\t252.6\t53.1\t58.7\t90.5\t-20.3\t70.6',
  '4\t鹿海なべ子\t7期生\t61.1\t66.0\t-16.6\t13.9\t55.6\t-62.7',
  '5\tトラミナ\t6期生\t122.0\t3.0\t3.0\t92.2\t-\t-',
  '16\t大和ちとせ\t5期生\t-35.1\t-55.9\t-42.5\t8.2\t―\t―',
].join('\n');

test('parseFreshStar: 順位はシートの列のまま、入会期を読み、回戦の数を対局数にする', () => {
  const { players } = parseFreshStar(FRESHSTAR_SAMPLE);
  assert.deepEqual(players, [
    { rank: 1, name: '結宮れちょ', total: 252.6, games: 5, period: '6期生' },
    { rank: 4, name: '鹿海なべ子', total: 61.1, games: 5, period: '7期生' },
    { rank: 5, name: 'トラミナ', total: 122.0, games: 3, period: '6期生' },
    { rank: 16, name: '大和ちとせ', total: -35.1, games: 3, period: '5期生' },
  ]);
});

test('parseFreshStar: 順位列が無ければ貼った順、入会期・回戦が無ければ空と null', () => {
  const { players } = parseFreshStar('氏名\t合計\nA\t10\nB\t20');
  assert.deepEqual(players, [
    { rank: 1, name: 'A', total: 10, games: null, period: '' },
    { rank: 2, name: 'B', total: 20, games: null, period: '' },
  ]);
});

test('parseFreshStar: 必須列が無ければ ParseError', () => {
  assert.throws(() => parseFreshStar(''), ParseError);
  assert.throws(() => parseFreshStar('順位\t入会期\n1\t6期生'), ParseError);
  assert.throws(() => parseFreshStar('氏名\t合計\n\t'), ParseError);
});

// 今節（節の列のうち、数字が入っている一番右の列）
const SETSU = [
  '順位\t組\t登録名\tトータル\t対局数\t第1節\t回\t第2節\t回\t第3節\t回',
  '1\tD\t山田 太郎\t333.3\t8\t120.5\t4\t212.8\t4\t\t',
  '2\tA\t佐藤 花子\t-26.3\t4\t-26.3\t4\t\t\t\t',
].join('\n');

test('今節：数字が入っている一番右の節の列を latest に入れる', () => {
  const { players } = parseStandings(SETSU);
  assert.equal(players[0].latest, 212.8);
  // 第2節を打っていない人は今節なし
  assert.equal(players[1].latest, null);
});

test('今節：節の列が無ければ latest は null', () => {
  const { players } = parseStandings('登録名\tトータル\n鈴木\t10');
  assert.equal(players[0].latest, null);
});

test('今節：「回」の列は節として拾わない', () => {
  const text = [
    '登録名\tトータル\t第1節\t回',
    '鈴木\t10\t10\t4',
  ].join('\n');
  const { players } = parseStandings(text);
  assert.equal(players[0].latest, 10);
});
