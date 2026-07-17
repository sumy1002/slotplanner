#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'template-ui.js'), 'utf8'));
const TU = window.SlotPlanner.ConfigEditor.TemplateUi;

const base = { showTemplatePanel: false, diffOpen: false, tplLoadPreviewOpen: false };
assert.deepStrictEqual(TU.resolveTemplateEsc(base), base);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: false }),
  { showTemplatePanel: false, diffOpen: false, tplLoadPreviewOpen: false }
);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: true, tplLoadPreviewOpen: false }),
  { showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: false }
);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: true, tplLoadPreviewOpen: true }),
  { showTemplatePanel: true, diffOpen: true, tplLoadPreviewOpen: false }
);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: true }),
  { showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: false }
);

console.log('template-ui_test: OK');
