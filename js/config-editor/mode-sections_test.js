#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'mode-sections.js'), 'utf8'));
const MS = window.SlotPlanner.ConfigEditor.ModeSections;

const ids = s => s.map(x => x.id);
assert.ok(ids(MS.sectionsForKind('SPIN')).includes('pay_type'));
assert.ok(!ids(MS.sectionsForKind('SPIN')).includes('wheel'));
assert.ok(ids(MS.sectionsForKind('WHEEL')).includes('bonus_items'));
assert.ok(ids(MS.sectionsForKind('COLLECTION')).includes('collect'));

assert.deepStrictEqual(
  MS.defaultEnabledSections('SPIN').sort(),
  ['pay_type'].sort()
);
const col = MS.defaultEnabledSections('COLLECTION').sort();
assert.deepStrictEqual(col, ['bonus_items', 'collect', 'collect_target', 'hold_win'].sort());

assert.deepStrictEqual(
  MS.resolveEnabledSections({ mode_kind: 'SPIN', enabled_sections: ['cascade'] }),
  ['cascade']
);
const allSpin = ids(MS.sectionsForKind('SPIN')).sort();
assert.deepStrictEqual(
  MS.resolveEnabledSections({ mode_kind: 'SPIN' }).sort(),
  allSpin
);

const m = { mode_kind: 'PICK' };
const mat = MS.materializeEnabledSections(m);
assert.ok(Array.isArray(m.enabled_sections));
assert.deepStrictEqual(mat.sort(), ids(MS.sectionsForKind('PICK')).sort());

console.log('mode-sections_test: OK');
