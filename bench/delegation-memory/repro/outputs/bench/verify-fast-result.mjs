import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// Small correctness suite: no memory benchmark runs here.
if (!process.argv.includes('--child')) {
  let total = 0;
  for (const mode of ['tools', 'graphql17']) {
    const results = [];
    for (const patched of [false, true]) {
      const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', mode, String(patched)], { encoding: 'utf8', timeout: 30000 });
      assert.equal(child.status, 0, child.stderr);
      results.push(JSON.parse(child.stdout));
    }
    assert.deepEqual(results[1], results[0], mode);
    console.log(`PASS ${mode}: ${results[0].length} differential cases, result JSON, descriptors, mutation, errors and ordering identical`);
    total += results[0].length;
  }
  console.log(`PASS total=${total} runtime=${process.version}`);
} else {
  const mode = process.argv.at(-2);
  if (process.argv.at(-1) === 'true') (await import('./candidate-fast-result.mjs')).enableFastResult();
  const g = mode === 'tools' ? await import('graphql') : await import('../../work/graphql-js/src/index.ts');
  const execute = mode === 'tools' ? (await import('@graphql-tools/executor')).normalizedExecutor : g.execute;
  const helper = mode === 'tools'
    ? (await import('./node_modules/@graphql-tools/executor/esm/execution/promiseForObject.js')).promiseForObject
    : (await import('../../work/graphql-js/src/jsutils/promiseForObject.ts')).promiseForObject;
  const helperRun = (input, signal, signalPromise) => mode === 'tools'
    ? helper(input, signal, signalPromise)
    : helper(input, values => Promise.all(values));
  const outputs = [];
  const inspect = object => {
    assert.equal(Object.getPrototypeOf(object), null);
    const descriptors = Object.entries(Object.getOwnPropertyDescriptors(object)).map(([key, descriptor]) => {
      assert.equal(descriptor.writable, true); assert.equal(descriptor.enumerable, true); assert.equal(descriptor.configurable, true);
      return [key, descriptor];
    });
    return { keys: Object.keys(object), descriptors };
  };
  const fields = Array.from({ length: 64 }, (_, i) => `f${i}:String`).join(' ');
  const schema = g.buildSchema(`type Query { row:Row rows:[Row] missing:Row } type Mutation { row:Row } type Row { a:String b:String fail:String must:String! child:Row ${fields} }`);
  const queries = [
    '{rows{a b child{a}}}',
    '{rows{__proto__:a constructor:b toString:a hasOwnProperty:b}}',
    '{rows{...F a child{...F}}} fragment F on Row { x:a y:b }',
    '{rows{a @skip(if:true) b @include(if:false)} missing{a}}',
    `{row{${Array.from({ length: 64 }, (_, i) => `f${i}`).join(' ')}}}`,
    '{row{a fail b}}', '{rows{a must b}}',
    'mutation{__proto__:row{a b} constructor:row{a}}',
    '{row{b __proto__:a constructor:b}}',
  ];
  for (const asynchronous of [false, true]) {
    const row = Object.assign(Object.create({ inherited: 'inherited' }), { a: 'A', b: 'B', child: { a: 'child' }, must: null });
    for (let i = 0; i < 64; ++i) row[`f${i}`] = `v${i}`;
    const rootValue = { row, rows: [row, null, row], missing: null };
    for (const query of queries) {
      const trace = [];
      const result = await execute({ schema, document: g.parse(query), rootValue,
        fieldResolver(source, _args, _ctx, info) {
          trace.push([...info.path.prev ? [info.path.prev.key] : [], info.path.key]);
          if (info.fieldName === 'fail') return asynchronous ? Promise.reject(new Error('expected failure')) : (() => { throw new Error('expected failure'); })();
          const value = source[info.fieldName];
          return asynchronous && info.parentType.name === 'Row' ? Promise.resolve(value) : value;
        },
      });
      const json = JSON.stringify(result);
      const maps = [];
      function visit(value) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        maps.push(inspect(value)); Object.values(value).forEach(visit);
      }
      visit(result.data);
      if (result.data) {
        result.data.__proto__ = 'safe'; assert.equal(Object.getPrototypeOf(result.data), null);
        Object.defineProperty(result.data, 'added', { value: 7, enumerable: true });
        delete result.data.__proto__; assert.equal(result.data.added, 7);
      }
      outputs.push({ name: `${asynchronous}:${query}`, json, maps, trace });
    }
  }
  // Helper supports arbitrary keys, including keys that GraphQL grammar excludes.
  for (const count of [0, 1, 4, 19, 20, 21, 64]) {
    const input = Object.create({ inherited: Promise.resolve('inherited') });
    for (const key of ['__proto__', 'constructor', 'toString', '', '2', '1', ...Array.from({length:count}, (_,i)=>`k${i}`)]) Object.defineProperty(input, key, { value: key.length % 2 ? Promise.resolve(key) : key, enumerable: true });
    input[Symbol('ignored')] = Promise.resolve('symbol');
    Object.defineProperty(input, 'hidden', { value: 'hidden', enumerable: false });
    const result = await helperRun(input);
    assert.equal(result.__proto__, '__proto__'); assert.equal(Object.getPrototypeOf(result), null);
    assert.equal(Object.getOwnPropertySymbols(result).length, 0); assert.equal(Object.hasOwn(result, 'hidden'), false);
    assert.equal(Object.hasOwn(result, 'inherited'), mode === 'tools');
    outputs.push({ name: `helper:${count}`, result: inspect(result) });
  }
  // Resolve out of order, but reserve observable enumeration order.
  const input = Object.create(null); let resolveFirst;
  input.first = new Promise(resolve => { resolveFirst = resolve; }); input.second = Promise.resolve('second'); input.third = 'third';
  const pending = helperRun(input); resolveFirst('first');
  outputs.push({ name: 'helper order', result: inspect(await pending) });
  for (const badKey of ['first', '__proto__']) {
    const failing = Object.create(null); failing[badKey] = Promise.reject(new Error('expected rejection'));
    await assert.rejects(async () => await helperRun(failing), { message: 'expected rejection' });
    outputs.push({ name: `helper rejection:${badKey}` });
  }
  // Promise rejection selection must remain the same when later keys reject first.
  let rejectEarly;
  const firstRejection = new Promise((_, reject) => { rejectEarly = reject; });
  const rejectionRace = helperRun({ earlierKey: firstRejection, laterKey: Promise.reject(new Error('later key rejected first')) });
  await assert.rejects(async () => await rejectionRace, { message: 'later key rejected first' });
  rejectEarly(new Error('earlier key rejected later'));
  await new Promise(resolve => setImmediate(resolve));
  outputs.push({ name: 'helper rejection ordering and handled losers' });
  if (mode === 'tools') {
    const controller = new AbortController(); controller.abort(new Error('pre-abort'));
    assert.throws(() => helperRun({}, controller.signal), { message: 'pre-abort' });
    const active = new AbortController(); let abort;
    const signalPromise = new Promise((_, reject) => { abort = reject; });
    const pending = helperRun({ field: new Promise(()=>{}) }, active.signal, signalPromise);
    active.abort(new Error('mid-abort')); abort(active.signal.reason);
    await assert.rejects(async () => await pending, { message: 'mid-abort' });
    outputs.push({ name: 'tools helper abort before/during pending' });
  }
  console.log(JSON.stringify(outputs));
}
