import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreCall } from '../src/methodology/score.js';

const pack = {
  traits: [
    { id: 'a', name: 'A', weight: 4 },
    { id: 'b', name: 'B', weight: 2 },
    { id: 'c', name: 'C', weight: 2 },
    { id: 'd', name: 'D', weight: 2 },
  ],
};

test('weighted scoring: met=1, partial=0.5, missed=0', () => {
  const { score } = scoreCall(pack, {
    traits: [
      { id: 'a', verdict: 'met', unverified: false },
      { id: 'b', verdict: 'partial', unverified: false },
      { id: 'c', verdict: 'missed', unverified: false },
      { id: 'd', verdict: 'met', unverified: false },
    ],
  });
  // (4*1 + 2*0.5 + 2*0 + 2*1) / 10 = 0.7
  assert.equal(score, 70);
});

test('not_applicable is excluded from the denominator', () => {
  const { score } = scoreCall(pack, {
    traits: [
      { id: 'a', verdict: 'met', unverified: false },
      { id: 'b', verdict: 'not_applicable', unverified: false },
      { id: 'c', verdict: 'not_applicable', unverified: false },
      { id: 'd', verdict: 'met', unverified: false },
    ],
  });
  assert.equal(score, 100);
});

test('unverified met is capped at partial value', () => {
  const { score } = scoreCall(pack, {
    traits: [
      { id: 'a', verdict: 'met', unverified: true },
      { id: 'b', verdict: 'met', unverified: false },
      { id: 'c', verdict: 'met', unverified: false },
      { id: 'd', verdict: 'met', unverified: false },
    ],
  });
  // (4*0.5 + 2 + 2 + 2) / 10 = 0.8
  assert.equal(score, 80);
});
