#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'mode-kind.js'), 'utf8'));
const MK = window.SlotPlanner.ConfigEditor.ModeKind;

assert.ok(MK.MODE_KIND_OPTIONS.some(o => o.v === 'OTHER' && o.label === '其他'));
assert.strictEqual(MK.MODE_KIND_LABEL.PICK, '點點樂');
assert.strictEqual(MK.MODE_KIND_LABEL.WHEEL, '輪盤');

assert.strictEqual(MK.isBonusKind({ mode_kind: 'SPIN' }), false);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'OTHER' }), false);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'WHEEL' }), true);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'PICK' }), true);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'COLLECTION' }), true);

assert.strictEqual(MK.modeAddCanConfirm({ name: '', nameTaken: false, kind: 'SPIN', otherText: '' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'FG', nameTaken: true, kind: 'SPIN', otherText: '' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'FG', nameTaken: false, kind: 'SPIN', otherText: '' }), true);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'BG', nameTaken: false, kind: 'OTHER', otherText: '' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'BG', nameTaken: false, kind: 'OTHER', otherText: '  ' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'BG', nameTaken: false, kind: 'OTHER', otherText: '消除' }), true);

const m1 = { mode_kind: 'SPIN', notes: '' };
MK.applyModeAddKind(m1, 'WHEEL', '忽略');
assert.strictEqual(m1.mode_kind, 'WHEEL');
assert.strictEqual(m1.notes, '');

const m2 = { mode_kind: 'SPIN', notes: '' };
MK.applyModeAddKind(m2, 'OTHER', '  點點樂變體  ');
assert.strictEqual(m2.mode_kind, 'OTHER');
assert.strictEqual(m2.notes, '點點樂變體');

console.log('mode-kind_test: OK');
