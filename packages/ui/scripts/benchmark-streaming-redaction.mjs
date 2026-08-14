import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { applyAssistantDelta } from '../dist/assistant-stream.js';
import { redactSecrets } from '../dist/redact.js';

const line = 'A realistic streamed paragraph contains prose, code, and api_key=ordinary-short-value.\n';
const input = line.repeat(800);
const deltaSize = 8;

function wholeText() {
  let source = '';
  let displayed = '';
  for (let offset = 0; offset < input.length; offset += deltaSize) {
    source += input.slice(offset, offset + deltaSize);
    displayed = redactSecrets(source);
  }
  return displayed;
}

function incremental() {
  let displayed = '';
  let state;
  for (let offset = 0; offset < input.length; offset += deltaSize) {
    const result = applyAssistantDelta(
      displayed,
      input.slice(offset, offset + deltaSize),
      {
        locale: 'en',
        ...(state === undefined ? {} : { redactionState: state }),
      },
    );
    displayed = result.text;
    state = result.redactionState;
  }
  return displayed;
}

function measure(run) {
  const started = performance.now();
  const output = run();
  return { output, milliseconds: performance.now() - started };
}

incremental();
const baseline = measure(wholeText);
const candidate = measure(incremental);
assert.equal(candidate.output, baseline.output);

const speedup = baseline.milliseconds / candidate.milliseconds;
console.log(JSON.stringify({
  inputChars: input.length,
  deltaSize,
  deltas: Math.ceil(input.length / deltaSize),
  candidatePath: 'applyAssistantDelta',
  wholeTextMs: Number(baseline.milliseconds.toFixed(2)),
  incrementalMs: Number(candidate.milliseconds.toFixed(2)),
  speedup: Number(speedup.toFixed(2)),
}, null, 2));
