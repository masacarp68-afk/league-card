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
