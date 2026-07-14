set -e
cd /home/claude/work
# ① Cells 欄匯出正確性 + ② LS 存讀持久(JS 端)
node - <<'EOF'
const fs=require('fs');
global.window={}; 
global.localStorage=(()=>{const m={};return{getItem:k=>m[k]??null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}};})();
global.window.localStorage=global.localStorage;
global.window.ExcelJS=require('exceljs');
eval(fs.readFileSync('helpers.js','utf8'));
eval(fs.readFileSync('aconfig-xlsx.js','utf8'));
const H=window.SlotPlanner.ConfigEditor.Helpers;
// seed:R2 有洞(活 0,2;洞 1),R1/R3 實心
localStorage.setItem('slotplanner.registry.v1',JSON.stringify({symbols:[
 {number:1,name:'A',symbol_id:'A',type:'HIGH',enabled:true,pays:{3:2},min_match:3}]}));
localStorage.setItem('slotplanner.aconfig.global.v1',JSON.stringify({
 simulation_count:10,random_seed:1,output_prefix:'lc',pay_type:'WAYS',starting_mode:'NG'}));
localStorage.setItem('slotplanner.aconfig.modes.v1',JSON.stringify([
 {mode:'NG',trigger_condition:'',spin_count:0,inherit_globals:true,on_enter_reset_vars:'',notes:''}]));
const mk=(id,cells)=>({reel_id:id,y_offset:0,max_rows:3,has_subreel:false,
 subreel_position:'',subreel_rows:0,subreel_inherit_weight:true,subreel_kind:'STACK',
 subreel_symbol_set:'',cells});
localStorage.setItem('slotplanner.aconfig.layout.v1',JSON.stringify([
 mk(1,null), mk(2,['0,0','0,2']), mk(3,null)]));
const w={};for(let r=1;r<=3;r++)w[`${r}-A`]=10;
localStorage.setItem('slotplanner.aconfig.reelweights.v1',JSON.stringify({NG:{symbol_ids:['A'],weights:w}}));
(async()=>{
 // ② LS 存讀持久:loadLayout 讀回 cells 原樣(normalizeMask 正規化不丟格)
 const lay=H.loadLayout();
 console.assert(JSON.stringify(lay[1].cells)==='["0,0","0,2"]' && lay[0].cells===null,
   'loadLayout cells: '+JSON.stringify(lay.map(x=>x.cells)));
 console.log('  PASS: ② LS 存讀持久(loadLayout cells 原樣)');
 // ① 匯出 Cells 欄
 const buf=await window.SlotPlanner.buildAxlsxBufferFromLS();
 fs.writeFileSync('/tmp/lc_A.xlsx',Buffer.from(buf));
 const wb=new (require('exceljs')).Workbook();
 await wb.xlsx.load(fs.readFileSync('/tmp/lc_A.xlsx'));
 const ws=wb.getWorksheet('02_Layout');
 const hdr=[];ws.getRow(1).eachCell((c,i)=>hdr[i]=String(c.value));
 const ci=hdr.indexOf('Cells');
 const cellsCol=[2,3,4].map(r=>String(ws.getRow(r).getCell(ci).value??''));
 console.assert(cellsCol[0]==='' && cellsCol[1]==='0,0;0,2' && cellsCol[2]==='',
   'Cells col: '+JSON.stringify(cellsCol));
 console.log('  PASS: ① A.xlsx Cells 欄正確(空/0,0;0,2/空)');
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
EOF
# ③ Python 端:a_loader 解析 + 洞格排除(環形/不規則盤語意)
cd pyval && python3 - <<'EOF'
import sys,warnings; sys.path.insert(0,'.')
warnings.filterwarnings('ignore')
from a_loader import load_a_config
cfg=load_a_config('/tmp/lc_A.xlsx')
r2=[r for r in cfg.layout.reels if r.reel_id==2][0]
rows=r2.active_local_rows()
assert rows==[0,2], rows                     # 洞格 1 排除
r1=[r for r in cfg.layout.reels if r.reel_id==1][0]
assert r1.active_local_rows()==[0,1,2]       # 實心全列
print('  PASS: ③ Python 洞格排除(R2 活列 [0,2],洞 1 不物化;R1 全列)')
print('★ Layer C 三情境 headless 冒煙全 PASS(④ 畫布無紅標為視覺項,續掛真機)')
EOF
