#!/usr/bin/env node
/* driver.js — 直接呼叫真實前端 aconfig-xlsx.js / docgen.js 的匯出函式，
 * 產生 A文件(A.xlsx) / 公司格式文件(.xlsm 含 VBA 巨集) / MD文件(機制文件.md)。
 * 比照 engine/tests/r1_roundtrip_test.js 的 shim 手法：Node 端補 window/localStorage，
 * 直接 eval 前端原始碼，呼叫其掛在 window.SlotPlanner 上的公開函式 ——
 * 不重寫任何格式邏輯，確保排版（欄寬/列高/底色/巨集）與真實 App 輸出逐位元一致。
 */
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', '..', 'js');

global.window = {};
global.localStorage = (() => {
  const m = {};
  return {
    getItem: k => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: k => { delete m[k]; },
    clear: () => { for (const k in m) delete m[k]; },
    key: i => Object.keys(m)[i],
    get length() { return Object.keys(m).length; },
  };
})();
global.window.localStorage = global.localStorage;
global.window.ExcelJS = require('exceljs');
global.window.fflate = require('fflate');

function loadScript(relPath) {
  const p = path.join(JS_DIR, relPath);
  const src = fs.readFileSync(p, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(src);
}

loadScript('registry.js');
loadScript('config-editor/helpers.js');
loadScript('game-spec.js');
loadScript('aconfig-xlsx.js');
loadScript('docgen.js');

const SP = global.window.SlotPlanner;
const H = SP.ConfigEditor.Helpers;

// ── LS key 常數（對齊 setup.js 內的實際 key 名） ──
const LS = {
  registry:    'slotplanner.registry.v1',
  global:      'slotplanner.aconfig.global.v1',
  layout:      'slotplanner.aconfig.layout.v1',
  panels:      'slotplanner.aconfig.panels.v1',
  symbolsets:  'slotplanner.aconfig.symbolsets.v1',
  paylines:    'slotplanner.aconfig.paylines.v1',
  constraints: 'slotplanner.aconfig.constraints.v1',
  reelweights: 'slotplanner.aconfig.reelweights.v1',
  gridweights: 'slotplanner.aconfig.gridweights.v1',
  comboweights:'slotplanner.aconfig.comboweights.v1',
  discards:    'slotplanner.aconfig.discards.v1',
  rules:       'slotplanner.aconfig.rules.v1',
  jackpots:    'slotplanner.aconfig.jackpots.v1',
  betconfig:   'slotplanner.aconfig.betconfig.v1',
  reelstrips:  'slotplanner.aconfig.reelstrips.v1',
  reellinks:   'slotplanner.aconfig.reellinks.v1',
  multipliers: 'slotplanner.aconfig.multipliers.v1',
  coinvalues:  'slotplanner.aconfig.coinvalues.v1',
  genlimits:   'slotplanner.aconfig.genLimits.v1',
  genconstraints:'slotplanner.aconfig.genConstraints.v1',
  symbolgroups:'slotplanner.aconfig.symbolgroups.v1',
  jackpotcfg:  'slotplanner.aconfig.jackpot.v1',
  cellattrs:   'slotplanner.aconfig.cellattrs.v1',
  tracks:      'slotplanner.aconfig.tracks.v1',
  meters:      'slotplanner.aconfig.meters.v1',
  gamble:      'slotplanner.aconfig.gamble.v1',
  modes:       'slotplanner.aconfig.modes.v1',
  bins:        'slotplanner.aconfig.bins.v1',
};

function resetLS() { global.localStorage.clear(); }

function seed(gameData) {
  resetLS();
  for (const [key, lsKey] of Object.entries(LS)) {
    if (gameData[key] === undefined) continue;
    global.localStorage.setItem(lsKey, JSON.stringify(gameData[key]));
  }
}

async function buildDocsForGame(gameData, outDir, slug) {
  seed(gameData);
  fs.mkdirSync(outDir, { recursive: true });

  // ── A文件（A.xlsx，原始 aconfig-xlsx.js 契約）──
  const aBuf = await SP.buildAxlsxBufferFromLS();
  fs.writeFileSync(path.join(outDir, `${slug}_A文件.xlsx`), Buffer.from(aBuf));

  // ── 公司格式文件（docgen 企劃/公司格式 Excel → 轉 xlsm 含 VBA 巨集）──
  const cfg = SP.DocGen.collectConfig();
  let meta = SP.DocGen.defaultMeta(cfg);
  meta = Object.assign(meta, gameData.docMeta || {});
  meta = SP.DocGen.mergeMeta(meta, cfg);
  const companyBuf = await SP.DocGen.buildCompanyXlsxBuffer(JSON.parse(JSON.stringify(meta)));
  const xlsmBuf = SP.DocGen._xlsxToXlsmBuffer(companyBuf);
  fs.writeFileSync(path.join(outDir, `${slug}_公司格式文件.xlsm`), Buffer.from(xlsmBuf));

  // ── MD文件（機制文件 markdown）──
  const md = SP.DocGen.buildMechMarkdown(JSON.parse(JSON.stringify(meta)));
  fs.writeFileSync(path.join(outDir, `${slug}_機制文件.md`), md, 'utf8');

  return { aBuf, companyBuf, xlsmBuf, md };
}

module.exports = { buildDocsForGame, seed, resetLS, SP, H, LS };
