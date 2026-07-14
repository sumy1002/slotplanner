// docgen 輸出零 diff 驗證器:固定 LS → 跑 3 builder → 產內容簽章(避開 xlsx zip 時間戳)
// 用法:DOCGEN_PATH=/mnt/project/docgen.js node docgen_zerodiff.js  → 印簽章 JSON
const fs = require('fs');
const crypto = require('crypto');
global.window = {};
global.localStorage = (() => { const m={}; return { getItem:k=>m[k]??null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];}, key:i=>Object.keys(m)[i], get length(){return Object.keys(m).length;} }; })();
global.window.localStorage = global.localStorage;
const ExcelJS = require('exceljs');
global.window.ExcelJS = ExcelJS;

// ── 固定輸入(涵蓋多路徑:2 模式、數符號、has_jackpot、paylines)──
localStorage.setItem('slotplanner.aconfig.global.v1', JSON.stringify({ pay_type:'LINE', payline_direction:'LTR', reels:5, rows:3, megaways:false, game_name:'測試遊戲', has_jackpot:true }));
localStorage.setItem('slotplanner.aconfig.modes.v1', JSON.stringify([{mode:'NG',mode_kind:'SPIN'},{mode:'FG',mode_kind:'SPIN',free:true}]));
localStorage.setItem('slotplanner.registry.v1', JSON.stringify({ symbols:[
  {symbol_id:'WILD',name:'百搭',number:0,type:'WILD',enabled:true,weight:50,is_wild:true,reel_limit:[true,true,true,true,true]},
  {symbol_id:'SCAT',name:'獎徵',number:1,type:'SCATTER',enabled:true,weight:30,is_scatter:true,reel_limit:[true,true,true,true,true]},
  {symbol_id:'H1',name:'王冠',number:2,type:'一般得分',enabled:true,weight:100,pay_3x:10,pay_4x:30,pay_5x:100,reel_limit:[true,true,true,true,true]},
  {symbol_id:'L1',name:'A',number:3,type:'一般得分',enabled:true,weight:200,pay_3x:5,pay_4x:15,pay_5x:50,reel_limit:[true,true,true,true,true]},
]}));
localStorage.setItem('slotplanner.aconfig.paylines.v1', JSON.stringify([{id:1,pattern:[1,1,1,1,1]},{id:2,pattern:[0,0,0,0,0]}]));
localStorage.setItem('slotplanner.aconfig.jackpot.v1', JSON.stringify({ enabled:true, trigger:'COLLECT_METER', tiers:[{name:'MINI',value:10},{name:'GRAND',value:1000}] }));
localStorage.setItem('slotplanner.aconfig.layout.v1', JSON.stringify([{max_rows:3},{max_rows:3},{max_rows:3},{max_rows:3},{max_rows:3}]));

eval(fs.readFileSync('helpers.js','utf8'));
eval(fs.readFileSync(process.env.DOCGEN_PATH,'utf8'));
const DG = global.window.SlotPlanner.DocGen;

function maskDates(s) {
  return String(s)
    .replace(/\d{4}\/\d{1,2}\/\d{1,2}[^\n|"]*?\d{1,2}:\d{2}:\d{2}/g, '[DT]')   // 2026/7/14 上午6:56:10
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '[ISO]')                          // ExcelJS ISO 日期
    .replace(/\d{4}\/\d{1,2}\/\d{1,2}/g, '[D]');                               // 純日期
}
function xlsxSig(buf) {
  const wb = new ExcelJS.Workbook();
  return wb.xlsx.load(Buffer.from(buf)).then(() => {
    const names = wb.worksheets.map(w=>w.name).sort();
    let lines = [];
    for (const nm of names) {
      const ws = wb.getWorksheet(nm);
      lines.push('##SHEET:'+nm);
      ws.eachRow((r,i)=>{ lines.push(i+'|'+maskDates(JSON.stringify(r.values))); });
    }
    return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
  });
}
(async () => {
  const md = maskDates(DG.buildMechMarkdown(null));
  const planBuf = await DG.buildPlanXlsxBuffer(null);
  const compBuf = await DG.buildCompanyXlsxBuffer(null);
  const out = {
    md_sha: crypto.createHash('sha256').update(md).digest('hex'),
    md_len: md.length,
    plan_sig: await xlsxSig(planBuf),
    comp_sig: await xlsxSig(compBuf),
  };
  console.log(JSON.stringify(out));
})().catch(e=>{ console.error('HARNESS_ERROR', e.message); process.exit(2); });
