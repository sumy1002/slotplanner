#!/usr/bin/env node
// ============================================================
//  audit-zh-locale.js — 前端中文化稽核腳本(UI/UX 改版 P4)
//
//  目的:掃描 js/**/*.js 與根目錄 *.html,抓出可能殘留的英文顯示字串,
//       供人工複核「是否為使用者可見文字」(需中文化)或「技術識別字」(不用動)。
//
//  掃描目標:
//    1. 靜態 title="..." / placeholder="..." / aria-label="..."
//    2. 動態綁定 :title="'...'" / :placeholder="'...'" 內的字串常值
//    3. 模板文字節點(> 與 < 之間)中「大寫字母開頭的英文單字組合」(≥2 個連續 Capitalized word)
//
//  用法:node scripts/audit-zh-locale.js
//  無任何新依賴,純 Node 內建 fs/path,可隨時安全執行,不會修改任何檔案。
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ── 掃描目標 ──
const TARGET_GLOBS = [
  { dir: path.join(ROOT, 'js'), recursive: true, ext: '.js' },
  { dir: ROOT, recursive: false, ext: '.html' },
];

// ── 白名單:已知的技術識別字 / schema 範例值 / 品牌名,不算「待中文化的英文殘留」──
// 用「完整比對」或「子字串包含」皆可,依 WHITELIST_SUBSTR 判斷。
const WHITELIST_EXACT = new Set([
  'JetBrains Mono', 'Plus Jakarta Sans', 'Noto Sans TC',
  'Excel Online', 'Google Sheets',
]);
const WHITELIST_SUBSTR = [
  'ExcelJS', 'html2canvas', 'SlotPlanner', 'GitHub', 'Vue',
  'localStorage', 'sessionStorage', 'JSON', 'CSV', 'XLSX', 'PNG', 'JPEG',
  'RTP', 'DSL', 'JP', 'ID', 'URL', 'HTML', 'CSS', 'API',
];

// ── 只在乎「使用者可能看到」的屬性,不管純程式邏輯用的屬性 ──
const ATTR_NAMES = ['title', 'placeholder', 'aria-label'];

function walk(dir, recursive, ext, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (recursive) walk(full, recursive, ext, out);
      continue;
    }
    if (full.endsWith(ext)) out.push(full);
  }
}

function collectFiles() {
  const files = [];
  for (const g of TARGET_GLOBS) walk(g.dir, g.recursive, g.ext, files);
  return files;
}

function lineOf(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

function isWhitelisted(text) {
  if (WHITELIST_EXACT.has(text.trim())) return true;
  return WHITELIST_SUBSTR.some(w => text.includes(w));
}

// 2 個以上連續「大寫開頭英文單字」組合,例如 "New Symbol" / "Select Mode"
const CAPWORD_PHRASE_RE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,})\b/g;

function findSuspiciousPhrases(text) {
  const hits = [];
  let m;
  CAPWORD_PHRASE_RE.lastIndex = 0;
  while ((m = CAPWORD_PHRASE_RE.exec(text))) {
    if (!isWhitelisted(m[1])) hits.push(m[1]);
  }
  return hits;
}

function auditFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const findings = [];

  // 1+2. title / placeholder / aria-label(靜態或動態綁定內的字串常值)
  for (const attr of ATTR_NAMES) {
    // 靜態:title="..."
    const staticRe = new RegExp(`\\b${attr}="([^"]*)"`, 'g');
    let m;
    while ((m = staticRe.exec(content))) {
      const val = m[1];
      const hits = findSuspiciousPhrases(val);
      if (hits.length) {
        findings.push({ kind: `${attr}(靜態)`, line: lineOf(content, m.index), text: val, hits });
      }
    }
    // 動態綁定:`:title="... '單引號字串' ..."` — 取出所有單引號字串常值再檢查
    const dynRe = new RegExp(`:${attr}="([^"]*)"`, 'g');
    while ((m = dynRe.exec(content))) {
      const expr = m[1];
      const strLits = expr.match(/'([^']*)'/g) || [];
      for (const lit of strLits) {
        const val = lit.slice(1, -1);
        const hits = findSuspiciousPhrases(val);
        if (hits.length) {
          findings.push({ kind: `${attr}(動態綁定字串)`, line: lineOf(content, m.index), text: val, hits });
        }
      }
    }
  }

  // 3. 模板文字節點:> 與 < 之間的內容
  // 排除 class="cfg-key" 的技術參照標籤(整個專案慣例:中文主標籤 + 英文/schema 名當次要註記,
  // 例如 `購買 <span class="cfg-key">Buy Feature</span>`,故意保留英文,不算殘留)。
  const cfgKeySpanRe = /(<span class="cfg-key">)([^<]*)(<\/span>)/g;
  const contentNoCfgKey = content.replace(cfgKeySpanRe, (_m, open, inner, close) => open + '_'.repeat(inner.length) + close);
  const textNodeRe = />([^<>{}]{2,})</g;
  let m2;
  while ((m2 = textNodeRe.exec(contentNoCfgKey))) {
    const val = m2[1];
    const hits = findSuspiciousPhrases(val);
    if (hits.length) {
      findings.push({ kind: '模板文字節點', line: lineOf(content, m2.index), text: val.trim(), hits });
    }
  }

  return findings;
}

function main() {
  const files = collectFiles();
  let totalHits = 0;
  const report = [];

  for (const file of files) {
    const findings = auditFile(file);
    if (findings.length) {
      report.push({ file: path.relative(ROOT, file), findings });
      totalHits += findings.length;
    }
  }

  if (!report.length) {
    console.log('✅ 沒有掃到疑似殘留的英文顯示字串(依目前白名單規則)。');
    return;
  }

  console.log(`⚠ 掃到 ${totalHits} 處疑似殘留英文字串,請人工複核(技術識別字/範例值可忽略,實際 UI 文字需補中文):\n`);
  for (const { file, findings } of report) {
    console.log(`── ${file} ──`);
    for (const f of findings) {
      console.log(`  L${f.line} [${f.kind}] 「${f.text}」  →  疑似英文:${f.hits.join(' / ')}`);
    }
    console.log('');
  }
  console.log(`若確認為技術識別字(schema ID 範例值 / CSS class / 品牌名稱),請加入本檔案頂部的 WHITELIST_EXACT 或 WHITELIST_SUBSTR。`);
}

main();
