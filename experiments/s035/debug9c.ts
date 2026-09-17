import { verrinCanon } from '../../src/canon/verrin.js';
import { buildModel, phaseATruth } from '../../src/derive/propagation.js';
import { incrementalApply } from '../s034/probe.js';
import { history } from '../s034/history.js';
import { serialize, restore } from '../s034/probe.js';

const canon = verrinCanon();
const h = history(canon, 10, 20261116);

// Build to prefix 5
let model = buildModel(canon, []);
for (let i = 0; i < 5; i++) model = incrementalApply(canon, model, h[i]!);

const snap = serialize(model);
console.log('h[5]:', JSON.stringify(h[5]));
console.log('h[6]:', JSON.stringify(h[6]));
console.log('model.nodeIds.length:', model.nodeIds.length);

// Branch A: restore + apply h[5]
let mA = restore(canon, snap);
let truthA = phaseATruth(mA);
mA = incrementalApply(canon, mA, h[5]!);
truthA = phaseATruth(mA);

// Branch B: restore + apply h[6]
let mB = restore(canon, snap);
let truthB = phaseATruth(mB);
mB = incrementalApply(canon, mB, h[6]!);
truthB = phaseATruth(mB);

console.log('mA.nodeIds.length:', mA.nodeIds.length);
console.log('mB.nodeIds.length:', mB.nodeIds.length);

let differ = false;
for (const n of mA.nodeIds) {
  const a = truthA.get(n);
  const b = truthB.get(n);
  if (a !== b) {
    differ = true;
    console.log('DIFF:', n, a, 'vs', b);
    break;
  }
}
if (!differ) {
  console.log('No truth differences found');
  // Show truth values for all nodes
  for (const n of mA.nodeIds) {
    const a = truthA.get(n);
    const b = truthB.get(n);
    if (a !== undefined || b !== undefined) {
      console.log(n, 'A:', a, 'B:', b);
    }
  }
}
