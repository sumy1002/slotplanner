#!/usr/bin/env node
'use strict';
/**
 * Vue 編譯 template expression 時，若 expression 含字面 '\n'，
 * code gen 會把真正換行寫進 new Function 本體 → SyntaxError。
 * 預覽換行應在 setup computed 內 join，勿寫在 template。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tpl = fs.readFileSync(path.join(__dirname, 'template.js'), 'utf8');
const setup = fs.readFileSync(path.join(__dirname, 'setup.js'), 'utf8');

assert.ok(
  !/\{\{\s*modeAddDlgPreview\.join\('\\n'\)\s*\}\}/.test(tpl),
  "template 不可使用 modeAddDlgPreview.join('\\n')（會弄破 Vue compile）"
);

assert.ok(
  /modeAddDlgPreview\s*=\s*computed\(/.test(setup),
  'setup 應有 modeAddDlgPreview computed'
);
assert.ok(
  /return lines\.join\('\\n'\)/.test(setup) || /return lines\.join\("\\n"\)/.test(setup),
  'modeAddDlgPreview 應在 computed 內 lines.join(\'\\n\') 回傳字串'
);
assert.ok(
  /\{\{\s*modeAddDlgPreview\s*\}\}/.test(tpl),
  'template 應直接顯示 modeAddDlgPreview 字串'
);

console.log('mode-add-preview_test: OK');
