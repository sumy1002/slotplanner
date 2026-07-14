#!/usr/bin/env node
/* v8.46 待辦:Layer C cellsToReels 洞格行為迴歸(42 案套件亡佚 → 精簡重建 14 案)
 * 驗證 v7.5-Layer C「欄內挖洞 block → allow」語意:洞 → cells mask;斷欄仍非法。 */
const fs = require('fs');
const src = fs.readFileSync('setup.js', 'utf8');
const a = src.indexOf('function cellsToReels(keys)');
const b = src.indexOf('function classifySelectionAsMain()');
if (a < 0 || b <= a) throw new Error('slice fail');
let cellsToReels;
eval('cellsToReels = ' + src.slice(a, b).replace(/^function cellsToReels/, 'function'));

let fails = 0;
const T = (name, keys, check) => {
  const r = cellsToReels(keys);
  const ok = check(r);
  console.log((ok ? '  PASS: ' : '  FAIL: ') + name + (ok ? '' : '  → ' + JSON.stringify(r)));
  if (!ok) fails++;
};

// ① 實心欄:cells=null(向後相容)
T('實心 2×3', ['0,0','0,1','0,2','1,0','1,1','1,2'],
  r => r.ok && r.reels.length===2 && r.reels.every(x => x.cells===null && x.max_rows===3 && x.y_offset===0));
// ② 單欄中間挖洞:span 含洞、mask 標活格
T('中洞 0,1,_,3', ['0,0','0,1','0,3'],
  r => r.ok && r.reels[0].max_rows===4 && JSON.stringify(r.reels[0].cells)==='["0,0","0,1","0,3"]');
// ③ 多洞
T('雙洞 0,_,2,_,4', ['0,0','0,2','0,4'],
  r => r.ok && r.reels[0].max_rows===5 && JSON.stringify(r.reels[0].cells)==='["0,0","0,2","0,4"]');
// ④ 各欄獨立 mask;實心欄仍 null
T('混合:R1 實心 / R2 有洞', ['0,0','0,1','0,2','1,0','1,2'],
  r => r.ok && r.reels[0].cells===null && JSON.stringify(r.reels[1].cells)==='["0,0","0,2"]'
    && r.reels[1].max_rows===3);
// ⑤ y_offset:欄頂不齊
T('階梯 y_offset', ['0,0','0,1','1,1','1,2'],
  r => r.ok && r.reels[0].y_offset===0 && r.reels[1].y_offset===1
    && r.reels.every(x => x.max_rows===2 && x.cells===null));
// ⑥ 全域最小 row 正規化(負座標)
T('負座標正規化', ['0,-2','0,-1','1,-1','1,0'],
  r => r.ok && r.reels[0].y_offset===0 && r.reels[1].y_offset===1);
// ⑦ 有洞 + y_offset 疊加
T('洞+位移', ['0,2','0,4','1,0','1,1'],
  r => r.ok && r.reels[0].y_offset===2 && JSON.stringify(r.reels[0].cells)==='["0,0","0,2"]'
    && r.reels[1].y_offset===0 && r.reels[1].cells===null);
// ⑧ 斷欄仍非法(欄間空欄)
T('斷欄拒收', ['0,0','2,0'], r => r.ok===false && /空欄/.test(r.error));
// ⑨ 空選取
T('空選取拒收', [], r => r.ok===false);
// ⑩ 非法 key 忽略後空 → 拒收
T('非法 key 全濾', ['abc','x,y'], r => r.ok===false);
// ⑪ 單格
T('單格', ['5,7'], r => r.ok && r.reels.length===1 && r.reels[0].max_rows===1 && r.reels[0].cells===null);
// ⑫ 洞在頂/底不成立(mask 以活格頂為 0,故頂/底無洞概念,跨距=首尾活格)
T('首尾即界', ['0,3','0,5','0,6'],
  r => r.ok && r.reels[0].max_rows===4 && JSON.stringify(r.reels[0].cells)==='["0,0","0,2","0,3"]');
// ⑬ reel_id 依欄序 1-based
T('reel_id 序', ['3,0','4,0','5,0'], r => r.ok && r.reels.map(x=>x.reel_id).join()==='1,2,3');
// ⑭ 欄順序無關(輸入亂序)
T('輸入亂序', ['1,2','0,0','1,0','0,1','1,1','0,2'],
  r => r.ok && r.reels.length===2 && r.reels.every(x=>x.max_rows===3 && x.cells===null));

console.log(fails===0 ? '\n★ cellsToReels 洞格迴歸 14 案全 PASS' : `\n✗ ${fails} FAIL`);
process.exit(fails?1:0);
