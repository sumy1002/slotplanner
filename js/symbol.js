// ============================================================
//  symbol.js — Symbol 管理頁
//  對應 symbol_manager.py 的 SymbolManagerPage
// ============================================================

(function () {
  'use strict';

  const { ref, reactive, computed, watch, onMounted, onBeforeUnmount } = Vue;
  const SP = window.SlotPlanner;

  const UNDO_LIMIT = 15;

  const SymbolPage = {
    props: {
      registry: { type: Object, required: true },
    },
    emits: ['status'],
    template: `
<div class="sym-page" :class="{ 'sym-has-sel': !!selectedId }">

  <!-- 行動版抽屜遮罩:點擊回清單層(桌面/平板由 CSS 隱藏)-->
  <div class="sym-drawer-scrim" @click="select(null)"></div>


  <!-- ============ 左側清單 ============ -->
  <aside class="sym-left">
    <div class="sym-toolbar">
      <button class="btn-pill add" @click="addSymbol" title="新增 symbol">+ 新增</button>
      <button class="btn-pill del" @click="deleteSelected" :disabled="!selectedId" title="刪除選取">✕ 刪除</button>
      <div class="spacer"></div>
    </div>

    <div class="sym-list">
      <div v-for="(s, idx) in symbols" :key="s.id"
           class="sym-item"
           :class="{
             selected: s.id === selectedId,
             'sym-item-disabled': s.enabled === false,
             'sym-item-dragging': dragIdx === idx,
             'sym-item-dropbefore': dragOverIdx === idx && dragIdx !== idx && dragIdx > idx,
             'sym-item-dropafter': dragOverIdx === idx && dragIdx !== idx && dragIdx < idx
           }"
           draggable="true"
           @dragstart="onDragStart(idx, $event)"
           @dragover="onDragOver(idx, $event)"
           @drop="onDrop(idx)"
           @dragend="onDragEnd"
           @click="select(s.id)">
        <div class="sym-drag-handle"
             @mousedown="dragHandleArmed = true"
             @mouseup="dragHandleArmed = false"
             @click.stop
             title="拖曳調整順序">⠿</div>
        <div class="sym-swatch" :class="{ 'has-img': !!s.image }"
             :style="s.image ? { backgroundImage: 'url(' + s.image + ')' } : swatchStyle(s.id)">
          <span v-if="!s.image">{{ initialOf(s) }}</span>
        </div>
        <div class="sym-item-info">
          <div class="sym-item-row1">
            <span class="sym-item-name">{{ s.name || '(未命名)' }}<span v-if="s.enabled === false" class="sym-item-off-tag">已停用</span></span>
            <span class="sym-item-pct">{{ pctOf(s) }}%</span>
          </div>
          <div class="sym-item-meta">
            <span>{{ s.enabled === false ? '—' : ('#' + s.number) }}</span>
            <span>權重 {{ s.weight }}</span>
          </div>
        </div>
        <button class="sym-item-toggle"
                :class="{ on: s.enabled !== false }"
                @click.stop="toggleEnabled(s.id)"
                :title="s.enabled === false ? '已停用 — 點擊重新啟用(不會匯出、不進權重同步)' : '啟用中 — 點擊暫停此符號(保留資料,僅排除於匯出與同步)'">
          <span class="sym-item-toggle-knob"></span>
        </button>
      </div>
      <div v-if="!symbols.length" style="text-align:center; padding:30px 10px; color:var(--text-light); font-size:12px;">
        （目前沒有 symbol）<br>點擊上方「+ 新增」開始
      </div>
    </div>

    <div class="sym-statusbar">
      <span>{{ symbols.length }} 個 symbol</span>
      <span class="weight-total">總權重 {{ totalWeight }}</span>
    </div>
  </aside>

  <!-- ============ 右側編輯面板 ============ -->
  <div class="sym-right">
    <header class="topbar">
      <div class="title">
        {{ selected ? '編輯：' + (selected.name || ('#' + selected.number) || ('id=' + selected.id)) : '編輯 Symbol' }}
      </div>
      <div class="topbar-actions">
        <button v-if="selected" class="sym-edit-toggle"
                :class="{ on: selected.enabled !== false }"
                @click="toggleEnabled(selected.id)"
                :title="selected.enabled === false ? '已停用 — 點擊重新啟用' : '啟用中 — 點擊停用此符號（資料保留,不匯出/不同步）'">
          {{ selected.enabled === false ? '⏸ 已停用' : '● 啟用中' }}
        </button>
        <button class="btn-pill" @click="exportJson" title="下載目前所有 symbol 為 JSON 設定檔">⇩ 匯出 JSON</button>
        <button class="btn-pill" @click="triggerImport" title="從 JSON 設定檔匯入（會覆寫目前資料）">⇧ 匯入 JSON</button>
        <button class="btn-pill" @click="resetDefaults" title="重設為預設 15 個 symbol">↺ 重設</button>
        <input ref="importInput" type="file" accept=".json,application/json" style="display:none" @change="importJson">
      </div>
    </header>

    <div v-if="!selected" class="sym-empty">
      ← 從左側選擇一個 symbol 來編輯，或點「+ 新增」建立一個
    </div>

    <div v-else class="sym-edit">
      <!-- 停用橫幅(#7:編輯中可直接停用/啟用,停用時下方資訊反灰) -->
      <div v-if="selected.enabled === false" class="sym-disabled-banner">
        <span>⏸ 此符號目前已停用 —— 不會匯出、不進權重同步。下方欄位僅供檢視。</span>
        <button class="btn-pill add" @click="toggleEnabled(selected.id)">↻ 重新啟用</button>
      </div>

      <div class="sym-edit-body" :class="{ 'is-off': selected.enabled === false }">
        <div class="sym-edit-cols">
        <div class="sym-edit-col sym-edit-col-left">

        <!-- ═══ 類型 / 權重(v7.9.3:合併權重;可收合,收合顯示類型)═══ -->
        <div class="sym-card" :class="{ 'sym-card-closed': !cardOpen.type }">
          <div class="sym-card-head" @click="toggleCard('type')">
            <span class="sym-card-title">類型 / 權重</span>
            <span v-if="!cardOpen.type" class="sym-card-summary">
              <span class="sym-card-summary-chip">{{ form.type }}</span>
            </span>
            <span class="sym-card-collapse" :class="{ open: cardOpen.type }" title="展開 / 收合">›</span>
          </div>
          <div class="sym-card-body" v-show="cardOpen.type">
            <div class="sym-type-chips sym-type-chips-lg">
              <button v-for="t in SYMBOL_TYPES" :key="t"
                      class="sym-type-chip"
                      :class="{ active: form.type === t }"
                      @click="setType(t)">{{ t }}</button>
            </div>
            <div v-if="roleNote" class="sym-role-note">{{ roleNote }}</div>
            <!-- 權重(併入此卡)-->
            <div class="sym-weight-block">
              <div class="field-label-sm">權重</div>
              <div class="weight-row">
                <input type="range" class="weight-slider"
                       min="0" max="1000" step="1"
                       v-model.number="form.weight"
                       :style="{'--val': (form.weight / 10) + '%'}"
                       @input="onFieldEdit">
                <div class="weight-val">{{ form.weight }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 外觀 / 識別(顏色/圖片 + 編號 + 名稱 + 代碼)— v7.9 卡片化 + 圖片 -->
        <div class="sym-card" :class="{ 'sym-card-closed': !cardOpen.appearance }">
          <div class="sym-card-head" @click="toggleCard('appearance')">
            <span class="sym-card-title">外觀 / 識別</span>
            <span class="sym-card-collapse" :class="{ open: cardOpen.appearance }" title="展開 / 收合">›</span>
          </div>
          <div class="sym-card-body" v-show="cardOpen.appearance">
          <div class="sym-appearance-row">
            <div class="sym-swatch-preview"
                 :class="{ 'has-img': !!form.image }"
                 :style="form.image ? { backgroundImage: 'url(' + form.image + ')' } : swatchStyle(selected.id)">
              <span v-if="!form.image">{{ initialOf(selected) }}</span>
              <button v-if="form.image" class="sym-img-clear" @click.stop="clearImage" title="移除圖片,改回色票">✕</button>
            </div>
            <div class="sym-appearance-ctrls">
              <div class="swatch-strip" style="display:grid; grid-template-columns:repeat(7, 23px); gap:5px; flex:none;">
                <div v-for="(c, i) in SWATCH_COLORS" :key="i"
                     class="swatch-cell"
                     :class="{selected: isCurrentSwatch(i) && !form.image}"
                     :style="{background: c[0]}"
                     :title="c[0]"
                     @click="pickSwatch(i)"></div>
                <!-- #3:自訂色票 — 明確提示「自訂顏色」+ 滴管圖示 -->
                <label class="swatch-cell swatch-custom"
                       :class="{selected: isCustomSwatch && !form.image}"
                       :style="{ background: (isCustomSwatch && !form.image) ? currentBg : 'transparent' }"
                       title="自訂顏色 — 點此開啟調色盤選任意色">
                  <input type="color" :value="currentBg"
                         @input="pickCustom($event.target.value)"
                         class="sym-color-input">
                  <span class="swatch-custom-ico">🎨</span>
                </label>
              </div>
              <!-- v7.9 #4:圖片 — 上傳檔案 / 貼上剪貼簿 -->
              <div class="sym-img-actions">
                <button class="btn-pill sym-img-btn" @click="triggerImageUpload" title="上傳圖片檔(僅存於本機,不進 A.xlsx)">🖼 上傳圖片</button>
                <button class="btn-pill sym-img-btn" @click="pasteImage" title="從剪貼簿貼上圖片(需瀏覽器授權)">📋 貼上圖片</button>
                <input ref="imageInput" type="file" accept="image/*" style="display:none" @change="onImageFile">
              </div>
              <div class="sym-img-hint">色票或圖片擇一;圖片僅存本機,不會匯出到 A.xlsx。也可直接 Ctrl+V 貼上。</div>
            </div>
          </div>
          <div class="sym-id-grid">
            <div>
              <div class="field-label-sm">編號 <span class="field-label-hint">依清單排序自動</span></div>
              <div class="input input-sm input-center input-w-num"
                   style="background:var(--surface-2, rgba(0,0,0,0.04)); cursor:default; user-select:none;"
                   :title="'編號由系統依「啟用中符號的上到下順序」自動指派,停用的符號不佔號'">
                {{ (selected && selected.enabled === false) ? '—' : (form.number || '00') }}
              </div>
            </div>
            <div>
              <div class="field-label-sm">名稱</div>
              <input class="input input-sm input-w-id"
                     :class="{err: nameErr}"
                     v-model="form.name"
                     @input="onFieldEdit"
                     placeholder="symbol 名稱">
              <div v-if="nameErr" class="field-err">名稱已重複</div>
            </div>
            <div>
              <div class="field-label-sm">
                Symbol_ID <span class="field-label-hint">A.xlsx 代碼,留空用名稱</span>
              </div>
              <input class="input input-sm cfg-mono input-w-id"
                     v-model="form.symbol_id"
                     @input="onFieldEdit"
                     placeholder="WILD / H1 / L2">
            </div>
          </div>
          </div>
        </div>

        <!-- 賠付表(#5:移到權重之上;#6:行格式改「N 連線」+ 明顯刪除鈕;#7:錯誤提示區) -->
        <div class="sym-card" :class="{ 'sym-card-closed': !cardOpen.pay }">
          <div class="sym-card-head" @click="toggleCard('pay')">
            <span class="sym-card-title">賠付表</span>
            <span v-if="cardOpen.pay" class="sym-card-sub">N 連線時的賠付倍數</span>
            <span v-else class="sym-card-summary">
              <span v-if="paySummary" class="sym-card-summary-chip cfg-mono">{{ paySummary }}</span>
              <span v-else class="sym-card-summary-muted">未設定賠付</span>
            </span>
            <span class="sym-card-collapse" :class="{ open: cardOpen.pay }" title="展開 / 收合">›</span>
          </div>
          <div class="sym-card-body" v-show="cardOpen.pay">
          <div class="sym-pay-dynamic">
            <div v-for="(row, i) in form.pay_rows" :key="i" class="sym-pay-drow"
                 style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <div class="cfg-stepper">
                <button class="cfg-stepper-btn" @click="bumpPayCount(i, -1)" title="減少連線數">−</button>
                <span class="cfg-stepper-val" style="min-width:26px; text-align:center;">{{ row.count }}</span>
                <button class="cfg-stepper-btn" @click="bumpPayCount(i, 1)" title="增加連線數">+</button>
              </div>
              <span style="font-size:12px; color:var(--text-light); white-space:nowrap;">連線</span>
              <input class="input input-sm cfg-mono sym-pay-input" type="number" step="any" min="0"
                     v-model.number="row.pay" @input="onFieldEdit" placeholder="賠付倍數"
                     style="flex:1; min-width:60px;">
              <span style="font-size:12px; color:var(--text-light); white-space:nowrap;">倍</span>
              <button class="btn-pill del" @click="removePayRow(i)"
                      :disabled="form.pay_rows.length <= 1" title="刪除此列"
                      style="white-space:nowrap;">🗑 刪除</button>
            </div>
            <div class="sym-pay-actions" style="margin-top:8px;">
              <button class="btn-pill add sym-pay-add-btn" @click="addPayRow"
                      :disabled="form.pay_rows.length >= maxPayCount - 1">＋ 新增連線數</button>
            </div>
            <!-- #7:錯誤/警告提示區(取代原靜態說明文字) -->
            <div v-if="payRowIssues.length"
                 style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
              <div v-for="(msg, k) in payRowIssues" :key="k" class="sym-pay-issue">
                {{ msg }}
              </div>
            </div>
          </div>
          </div><!-- /sym-card-body -->
        </div><!-- /賠付卡片 -->
        </div><!-- /sym-edit-col-left -->

        <div class="sym-edit-col sym-edit-col-right">

        <!-- 出現限制 / 規則(v7.9.5:合併;出現限制=生成期約束,規則=唯讀引用)-->
        <div class="sym-card" :class="{ 'sym-card-closed': !cardOpen.limit }">
          <div class="sym-card-head" @click="toggleCard('limit')">
            <span class="sym-card-title">出現限制 / 規則</span>
            <span v-if="cardOpen.limit" class="sym-card-sub">出現輪 / 上限,以及引用此符號的規則</span>
            <span v-else class="sym-card-summary">
              <span class="sym-card-status" :class="{ on: hasLimit }">{{ hasLimit ? '✓' : '—' }}</span>
              <span v-if="limitSummary">{{ limitSummary }}</span>
              <span v-else class="sym-card-summary-muted">無限制</span>
              <template v-if="rulesSummary">
                <span class="sym-card-summary-sep">·</span>{{ rulesSummary }}
              </template>
            </span>
            <span class="sym-card-collapse" :class="{ open: cardOpen.limit }" title="展開 / 收合">›</span>
          </div>
          <div class="sym-card-body" v-show="cardOpen.limit">

          <!-- ── 子區:出現限制 ── -->
          <div class="sym-subsection-label">出現限制</div>
          <div class="sym-limit-grid">
            <div>
              <div class="field-label-sm">出現輪限制 <span class="field-label-hint">主輪目前 {{ reelCount }} 輪</span></div>
              <div class="reel-limits">
                <label v-for="(b, i) in form.reel_limit" :key="i" class="chk">
                  <input type="checkbox" v-model="form.reel_limit[i]" @change="onFieldEdit">
                  <span class="box"></span>
                  <span>輪 {{ i + 1 }}</span>
                </label>
              </div>
              <!-- #8:副輪(連動盤面結構;預設不勾)。無副輪時不顯示 -->
              <template v-if="spec.subReels.length">
                <div class="field-label-sm" style="margin-top:8px;">副輪 <span class="field-label-hint">預設不勾</span></div>
                <div class="reel-limits">
                  <label v-for="s in spec.subReels" :key="s.key" class="chk">
                    <input type="checkbox" :checked="!!form.subreel_limit[s.key]"
                           @change="toggleSubLimit(s.key, $event.target.checked)">
                    <span class="box"></span>
                    <span>{{ s.label }}</span>
                  </label>
                </div>
              </template>
            </div>
            <div>
              <div class="field-label-sm">出現上限</div>
              <div class="sym-max-row">
                <label class="chk">
                  <input type="checkbox" v-model="form.use_max" @change="onFieldEdit">
                  <span class="box"></span>
                  <span>啟用</span>
                </label>
                <input class="input input-sm input-center" style="width:64px;"
                       type="number" min="0" max="999"
                       v-model.number="form.max_count"
                       :disabled="!form.use_max"
                       @input="onFieldEdit">
                <span class="sym-unit">顆</span>
              </div>
            </div>
          </div>

          <!-- 預留:更細的生成期約束(指定 reel/主副盤/數量)— 規劃中,尚未接引擎 -->
          <div class="sym-future-note">
            <span class="sym-future-note-tag">規劃中</span>
            <span>更細的「產牌限制」(指定符號於特定 reel / 主盤 / 副盤的出現數量上下限)為生成期約束,
            將於後續版本接入產牌引擎,屆時會在此設定。</span>
          </div>

          <div class="sym-subsection-divider"></div>

          <!-- ── 子區:規則(唯讀引用)── -->
          <div class="sym-subsection-label">
            規則
            <button class="btn-pill" style="font-size:11px; padding:2px 8px; margin-left:auto;"
                    @click.stop="refreshSymbolRefs" title="重新讀取">⟳</button>
          </div>
          <div v-if="!symbolRefs.constraints.length && !symbolRefs.rules.length && !symbolRefs.discards.length"
               style="font-size:12px; color:var(--text-light); padding:4px 0;">
            尚無約束 / 規則引用此符號。到「硬約束 / 規則」分頁設定後,這裡會自動顯示。
          </div>
          <template v-else>
            <div v-for="c in symbolRefs.constraints" :key="'rc'+c.constraint_id"
                 style="font-size:12px; padding:3px 0; border-bottom:1px dashed var(--divider, rgba(0,0,0,0.1));">
              🚫 <strong>{{ c.constraint_id }}</strong> · {{ c.ctype }}<span v-if="c.notes"> — {{ c.notes }}</span>
            </div>
            <div v-for="r in symbolRefs.rules" :key="'rr'+r.rule_id"
                 style="font-size:12px; padding:3px 0; border-bottom:1px dashed var(--divider, rgba(0,0,0,0.1));">
              🧩 <strong>{{ r.rule_id }}</strong> · {{ r.description || r.condition || '(無描述)' }}
            </div>
            <div v-for="d in symbolRefs.discards" :key="'rd'+d.discard_id"
                 style="font-size:12px; padding:3px 0; border-bottom:1px dashed var(--divider, rgba(0,0,0,0.1));">
              🗑 <strong>{{ d.discard_id }}</strong> · {{ d.notes || d.condition || '(棄牌)' }}
            </div>
          </template>
          <button class="btn-pill add" style="margin-top:8px; font-size:12px;"
                  :disabled="!selected" @click="addRelatedConstraint"
                  title="跳到硬約束分頁,並預填此符號">
            ＋ 新增與此符號相關的約束
          </button>
          <div style="font-size:11px; color:var(--text-light); margin-top:6px;">
            ※ 規則為唯讀總覽;按鈕會跳到硬約束分頁並預填此符號(規則 / 棄牌仍請至對應分頁設定)。
          </div>

          </div><!-- /sym-card-body -->
        </div><!-- /出現限制+規則 合併卡片 -->

        <!-- v6.3 / Q3:倍數(×N)/ 彩金倍數(N×)/ 金幣面額 -->
        <div class="sym-card" :class="{ 'sym-card-closed': !cardOpen.mult }">
          <div class="sym-card-head" @click="toggleCard('mult')">
            <span class="sym-card-title">倍數 / 彩金</span>
            <span v-if="cardOpen.mult" class="sym-card-sub">符號自帶倍數(×N)與彩金面額(N×)</span>
            <span v-else class="sym-card-summary">
              <span class="sym-card-status" :class="{ on: hasMult }">{{ hasMult ? '✓' : '—' }}</span>
              <span v-if="multSummary">{{ multSummary }}</span>
              <span v-else class="sym-card-summary-muted">未設定</span>
            </span>
            <button v-if="cardOpen.mult" class="btn-pill sym-mult-refresh"
                    @click.stop="refreshMultRefs" title="重讀模式 / JP 選項">⟳ 重讀</button>
            <span class="sym-card-collapse" :class="{ open: cardOpen.mult }" title="展開 / 收合">›</span>
          </div>
          <div class="sym-card-body" v-show="cardOpen.mult">
          <!-- 倍數 ×N(× 在數字前) -->
          <div class="sym-mult-grp">
            <div class="sym-mult-sublabel">
              倍數 <span>（×N;多筆＝加權隨機，留空＝無）</span>
            </div>
            <div v-for="(mv, i) in form.mult_values" :key="'mv'+i" class="sym-mult-row">
              <span class="sym-mult-x">×</span>
              <input class="input input-sm cfg-mono sym-mult-num" type="number" step="any" min="0"
                     v-model.number="mv.mult" @input="onFieldEdit" placeholder="倍數">
              <span class="sym-mult-wlabel">權重</span>
              <input class="input input-sm cfg-mono sym-mult-weight" type="number" step="any" min="0"
                     v-model.number="mv.weight" @input="onFieldEdit" placeholder="權重">
              <button class="btn-pill del sym-mult-del" @click="removeMultValue(i)" title="刪除此倍數">🗑</button>
            </div>
            <button class="btn-pill add" @click="addMultValue">＋ 新增倍數</button>
          </div>

          <div class="sym-mult-sep"></div>

          <!-- 彩金倍數 N×(× 在數字後)/ 金幣面額 -->
          <div class="sym-mult-grp">
            <div class="sym-mult-sublabel">
              彩金倍數 / 面額 <span>（N×;可連結 JP，各模式權重）</span>
            </div>
            <div v-for="(pv, i) in form.prize_values" :key="'pv'+i" class="sym-prize-row">
              <div class="sym-prize-head">
                <input class="input input-sm cfg-mono sym-prize-value" type="number" step="any" min="0"
                       v-model.number="pv.value" @input="onFieldEdit" placeholder="面額">
                <span class="sym-mult-x">×</span>
                <select class="input input-sm sym-prize-jp" v-model="pv.link_jackpot" @change="onFieldEdit">
                  <option value="">（純面額，不連結 JP）</option>
                  <option v-for="jp in jackpotOptions" :key="jp.jp_id" :value="jp.jp_id">{{ jp.name }}（{{ jp.jp_id }}）</option>
                </select>
                <button class="btn-pill del sym-mult-del" @click="removePrizeValue(i)" title="刪除此面額">🗑</button>
              </div>
              <div class="sym-prize-baserow">
                <span class="sym-mult-wlabel">基礎權重</span>
                <input class="input input-sm cfg-mono sym-prize-weight" type="number" step="any" min="0"
                       v-model.number="pv.weight" @input="onFieldEdit" placeholder="權重">
              </div>
              <div v-if="modeNames.length" class="sym-prize-modes">
                <label v-for="mn in modeNames" :key="mn" class="sym-prize-mode">
                  <span>W_{{ mn }}</span>
                  <input class="input input-sm cfg-mono" type="number" step="any" min="0"
                         v-model.number="pv.weight_by_mode[mn]" @input="onFieldEdit">
                </label>
              </div>
            </div>
            <button class="btn-pill add" @click="addPrizeValue">＋ 新增彩金倍數 / 面額</button>
          </div>
          </div><!-- /sym-card-body -->
        </div><!-- /倍數彩金卡片 -->

        <!-- 圖示尺寸 / Mega(#10:預設 1×1,點擊才展開設定)-->
        <div class="sym-card" :class="{ 'sym-card-closed': !cardOpen.size }">
          <div class="sym-card-head" @click="toggleCard('size')">
            <span class="sym-card-title">圖示尺寸</span>
            <span v-if="cardOpen.size" class="sym-card-sub">一般 1×1 或 Mega 多格 / 可擴張</span>
            <span v-else class="sym-card-summary"><span class="cfg-mono">{{ sizeSummary }}</span></span>
            <span class="sym-card-collapse" :class="{ open: cardOpen.size }" title="展開 / 收合">›</span>
          </div>
          <div class="sym-card-body" v-show="cardOpen.size">

          <!-- #10:可擴張標籤(預設關;實際擴張大小/條件於「規則」頁設定,此處僅開啟標籤) -->
          <label class="chk" style="margin-bottom:10px;">
            <input type="checkbox" v-model="form.can_expand" @change="onFieldEdit">
            <span class="box"></span>
            <span>此圖示可擴張 <span class="field-label-hint">擴張大小與條件於「規則」頁設定</span></span>
          </label>

          <div v-if="!showMega" class="sym-size-default">
            <span class="sym-size-badge">{{ form.mega_w }}×{{ form.mega_h }}</span>
            <span class="sym-size-desc">{{ (form.mega_w > 1 || form.mega_h > 1) ? 'Mega 符號（佔多格）' : '一般符號（1×1）' }}</span>
            <button class="btn-pill" @click="showMega = true">⤢ 設定 Mega 尺寸</button>
          </div>

          <div v-else class="sym-mega-edit">
            <div class="sym-mega-steppers">
              <div class="sym-mega-stepper-group">
                <span class="field-label-sm">寬（Reel）</span>
                <div class="cfg-stepper">
                  <button class="cfg-stepper-btn" @click="bumpMega('w', -1)" :disabled="form.mega_w <= 1">−</button>
                  <span class="cfg-stepper-val">{{ form.mega_w }}</span>
                  <button class="cfg-stepper-btn" @click="bumpMega('w', 1)" :disabled="form.mega_w >= 10">+</button>
                </div>
              </div>
              <div class="sym-mega-stepper-group">
                <span class="field-label-sm">高（列）</span>
                <div class="cfg-stepper">
                  <button class="cfg-stepper-btn" @click="bumpMega('h', -1)" :disabled="form.mega_h <= 1">−</button>
                  <span class="cfg-stepper-val">{{ form.mega_h }}</span>
                  <button class="cfg-stepper-btn" @click="bumpMega('h', 1)" :disabled="form.mega_h >= 10">+</button>
                </div>
              </div>
              <button class="btn-pill" @click="resetMega">↺ 還原 1×1</button>
            </div>

            <!-- ── Mega 視覺預覽小盤面 ── -->
            <div class="sym-mega-preview">
              <svg :viewBox="megaPreview.viewBox" class="sym-mega-svg"
                   :style="{ width: megaPreview.svgWidth + 'px', height: megaPreview.svgHeight + 'px' }"
                   xmlns="http://www.w3.org/2000/svg">
                <g>
                  <rect v-for="cell in megaPreview.cells" :key="cell.k"
                        :x="cell.x" :y="cell.y"
                        :width="megaPreview.cellSize - 1.5"
                        :height="megaPreview.cellSize - 1.5"
                        class="sym-mega-cell-bg"
                        :class="{ 'sym-mega-cell-on': cell.on, 'sym-mega-cell-clip': cell.clip }" />
                </g>
                <rect v-if="megaPreview.megaRect"
                      :x="megaPreview.megaRect.x" :y="megaPreview.megaRect.y"
                      :width="megaPreview.megaRect.w" :height="megaPreview.megaRect.h"
                      class="sym-mega-outline" />
                <text v-for="i in megaPreview.dispCols" :key="'R'+i"
                      :x="megaPreview.colLabelX(i)" :y="megaPreview.colLabelY"
                      class="sym-mega-axis">R{{ i }}</text>
              </svg>
              <div class="sym-mega-preview-info">
                <span class="sym-mega-preview-num">{{ form.mega_w * form.mega_h }}</span> 格
                <span v-if="megaPreview.clipped" class="sym-mega-preview-warn"
                      :title="'此符號 (' + form.mega_w + '×' + form.mega_h + ') 超出盤面範圍 (' + megaPreview.reelCols + '×' + megaPreview.maxRows + '),會被截斷'">
                  ⚠ 超出盤面
                </span>
              </div>
            </div>
          </div>
          </div><!-- /sym-card-body -->
        </div><!-- /圖示尺寸卡片 -->
        </div><!-- /sym-edit-col-right -->
        </div><!-- /sym-edit-cols -->

      </div><!-- /sym-edit-body -->
    </div>
  </div>
</div>
    `,

    setup(props, { emit }) {
      const SWATCH_COLORS = SP.SWATCH_COLORS;
      const registry = props.registry;

      // ── 工作區（registry 的鏡像，編輯時直接動這個） ──
      const symbols = ref([]);
      const swatchMap = ref({});
      const reelCount = ref(5);

      // ── 連動層(gameSpec)鏡像:賠付連線數上限 / 副輪清單 / 賠付模型 ──
      const gameSpec = SP.gameSpec || null;
      const spec = reactive({ reelCount: 5, maxLineLength: 5, payModel: 'LINE', isLineLike: true, subReels: [] });
      function syncSpec() {
        if (!gameSpec) return;
        spec.reelCount     = gameSpec.reelCount;
        spec.maxLineLength = gameSpec.maxLineLength;
        spec.payModel      = gameSpec.payModel;
        spec.isLineLike    = gameSpec.isLineLike;
        spec.subReels      = (gameSpec.subReels || []).map(s => ({ key: s.key, label: s.label, kind: s.kind }));
      }

      const selectedId = ref(null);
      let _detachSymSwipe = null;  // v7.6:行動版邊緣滑動 detach handle

      // #10:Mega 尺寸區是否展開(預設折疊,只有 mega>1×1 才自動展開)
      const showMega = ref(false);

      // ════════════════════════════════════════════════════════
      //  v7.9 #6/#7 + v7.9.3:編輯面板卡片化 — 全部卡片可摺疊
      //   純 UI 體驗,不影響資料/匯出。狀態持久化於 LS(跨 session 記住)。
      //   key = 卡片 id;value = true(展開) / false(收合)。
      //   收合時標頭右側顯示「選擇摘要」(見 cardSummary)。
      // ════════════════════════════════════════════════════════
      const CARD_LS_KEY = 'slotplanner.sym.cardOpen.v1';
      // v7.9.3:權重併入 type 卡;移除獨立 weight;全部卡片可收合
      // v7.9.5:出現限制與規則合併為一張卡(id=limit);移除 rules
      const OPTIONAL_CARDS = ['type', 'appearance', 'pay', 'mult', 'limit', 'size'];
      const _cardDefaults = { type: true, appearance: true, pay: true, mult: false, limit: true, size: false };
      const cardOpen = reactive({ ..._cardDefaults });
      try {
        const saved = JSON.parse(localStorage.getItem(CARD_LS_KEY) || 'null');
        if (saved && typeof saved === 'object') {
          OPTIONAL_CARDS.forEach(k => { if (typeof saved[k] === 'boolean') cardOpen[k] = saved[k]; });
        }
      } catch (e) {}
      function toggleCard(id) {
        if (OPTIONAL_CARDS.indexOf(id) < 0) return;
        cardOpen[id] = !cardOpen[id];
        try { localStorage.setItem(CARD_LS_KEY, JSON.stringify({ ...cardOpen })); } catch (e) {}
      }

      // ── 編輯表單 ──
      const form = reactive({
        number: '',
        name: '',
        weight: 100,
        use_max: false,
        max_count: 0,
        reel_limit: [],
        subreel_limit: {},   // v6.2 #8:副輪出現限制(key→bool)
        // ── A.xlsx 03_Symbols 擴充欄位 ──
        symbol_id: '',
        type: '一般得分',
        pay_3x: 0,
        pay_4x: 0,
        pay_5x: 0,
        pay_6x: 0,
        pay_rows: [],   // v6.1:動態賠付表(2–20 連);pay_3x–6x 由此同步,僅供向下相容
        mult_values: [],   // v6.3 / Q3:「倍數」×N
        prize_values: [],  // v6.3 / Q3:「彩金倍數」N× / 金幣面額
        mega_w: 1,
        mega_h: 1,
        can_expand: false,   // v6.2 #10:可擴張標籤
        is_wild: false,
        is_scatter: false,
        image: null,   // v7.9 #4:符號圖片(dataURL);僅存前端 LS,不進 A.xlsx
      });

      // Symbol Type 選項(v6.2 #2:移除 High/Low,改下列 7 類)
      const SYMBOL_TYPES = ['一般得分', 'WILD', 'SCATTER', 'FREE', 'BONUS', 'COIN', 'Other'];
      // 舊型別 → 新型別 遷移對照(向下相容舊存檔)
      const _TYPE_MIGRATE = {
        HIGH: '一般得分', LOW: '一般得分', NORMAL: '一般得分',
        WILD: 'WILD', SCATTER: 'SCATTER', FREE: 'FREE', BONUS: 'BONUS',
        COIN: 'COIN', SPECIAL: 'Other', OTHER: 'Other',
      };
      function normalizeType(t) {
        if (!t) return '一般得分';
        if (SYMBOL_TYPES.indexOf(t) >= 0) return t;          // 已是新型別
        const up = String(t).toUpperCase();
        return _TYPE_MIGRATE[up] || '一般得分';
      }

      // ── flushWrite:把待寫入的編輯立即落地(取代原 pushUndo 的 flush 行為) ──
      function flushWrite() {
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
      }

      // ── 檔案 input ref ──
      const importInput = ref(null);
      const imageInput = ref(null);   // v7.9 #4:圖片上傳 input

      // ── 防止 commit 觸發 syncFromRegistry 自循環 ──
      let _committing = false;

      // ════════════════════════════════════════════════════════
      //  與 registry 同步
      // ════════════════════════════════════════════════════════
      function syncFromRegistry() {
        if (_committing) return;
        symbols.value = registry.symbols();
        swatchMap.value = registry.swatchMap();
        reelCount.value = registry.reelCount();
        if (selectedId.value) {
          const sel = symbols.value.find(s => s.id === selectedId.value);
          if (!sel) {
            selectedId.value = null;
          } else {
            loadForm(sel);
          }
        }
      }

      function commit() {
        _committing = true;
        try {
          registry.applyAll(symbols.value, swatchMap.value);
        } finally {
          _committing = false;
        }
      }

      // ════════════════════════════════════════════════════════
      //  表單 ↔ 工作區
      // ════════════════════════════════════════════════════════
      function loadForm(s) {
        form.number = s.number;
        form.name = s.name;
        form.weight = s.weight;
        form.use_max = s.use_max;
        form.max_count = s.max_count;
        form.reel_limit = [...s.reel_limit];
        form.subreel_limit = (s.subreel_limit && typeof s.subreel_limit === 'object') ? { ...s.subreel_limit } : {};
        // 擴充欄位(向下相容:舊資料缺欄位給預設)
        form.symbol_id  = s.symbol_id  != null ? s.symbol_id  : '';
        form.type       = normalizeType(s.type);
        form.pay_3x     = s.pay_3x     != null ? s.pay_3x     : 0;
        form.pay_4x     = s.pay_4x     != null ? s.pay_4x     : 0;
        form.pay_5x     = s.pay_5x     != null ? s.pay_5x     : 0;
        form.pay_6x     = s.pay_6x     != null ? s.pay_6x     : 0;
        // v6.1:動態賠付表 — 以 pay_rows 為主,舊 pay_Nx 自動遷移;深拷貝避免編輯時改到原資料
        form.pay_rows   = _readPayRows(s);
        // v6.3 / Q3:倍數 / 彩金倍數(深拷貝;prize 補齊各模式權重 key)
        form.mult_values  = (Array.isArray(s.mult_values) ? s.mult_values : [])
          .map(v => ({ mult: Number(v.mult) || 0, weight: Number(v.weight) || 0 }));
        form.prize_values = (Array.isArray(s.prize_values) ? s.prize_values : [])
          .map(v => ({
            value: Number(v.value) || 0,
            weight: Number(v.weight) || 0,
            link_jackpot: v.link_jackpot != null ? String(v.link_jackpot) : '',
            weight_by_mode: _fillModeWeights(v.weight_by_mode),
          }));
        form.mega_w     = s.mega_w     != null ? s.mega_w     : 1;
        form.mega_h     = s.mega_h     != null ? s.mega_h     : 1;
        form.can_expand = !!s.can_expand;
        form.is_wild    = !!s.is_wild;
        form.is_scatter = !!s.is_scatter;
        form.image      = (s.image != null && typeof s.image === 'string') ? s.image : null;  // v7.9 #4
        // #10:有 mega 才預設展開,否則折疊成 1×1 badge
        showMega.value  = (Number(form.mega_w) > 1 || Number(form.mega_h) > 1);
      }

      const selected = computed(() => {
        if (selectedId.value === null) return null;
        return symbols.value.find(s => s.id === selectedId.value) || null;
      });

      // ── v6.2 規則 #11:反查「引用此符號的約束 / 規則 / 棄牌」(唯讀) ──
      const _refsTick = ref(0);
      function _rdLS(k) {
        try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
      }
      function scanSymbolRefs(sym) {
        const empty = { constraints: [], rules: [], discards: [] };
        if (!sym) return empty;
        const keys = new Set();
        if (sym.symbol_id) keys.add(String(sym.symbol_id).trim());
        if (sym.name) keys.add(String(sym.name).trim());
        if (sym.number !== '' && sym.number != null) keys.add('#' + sym.number);
        if (!keys.size) return empty;
        const has = (v) => v != null && keys.has(String(v).trim());
        const inList = (arr) => Array.isArray(arr) && arr.some(has);
        const inText = (t) => typeof t === 'string' && [...keys].some(k => k && t.includes(k));
        const effHas = (r) => {
          const effs = r.effects || r.actions || [];
          return Array.isArray(effs) && effs.some(e => {
            const p = (e && e.params) || e || {};
            return has(p.symbol_id) || inList(p.symbol_ids);
          });
        };
        return {
          constraints: _rdLS('slotplanner.aconfig.constraints.v1').filter(c => has(c.symbol_id)),
          rules:       _rdLS('slotplanner.aconfig.rules.v1').filter(r => inText(r.condition) || inText(r.description) || effHas(r)),
          discards:    _rdLS('slotplanner.aconfig.discards.v1').filter(d => inText(d.condition) || inText(d.notes)),
        };
      }
      const symbolRefs = computed(() => { _refsTick.value; return scanSymbolRefs(selected.value); });
      function refreshSymbolRefs() { _refsTick.value++; }
      // v6.2 規則#11 正向:跳到硬約束分頁並預填此符號(輕量雙向)
      function addRelatedConstraint() {
        const s = selected.value;
        if (!s) return;
        const id = (s.symbol_id && String(s.symbol_id).trim()) || s.name || ('#' + s.number);
        flushWrite();   // 先把目前編輯寫回,確保符號識別最新
        if (typeof SP !== 'undefined' && SP.goConfig) {
          SP.goConfig({ tab: 'constraints', addConstraintFor: id });
        } else {
          emitStatus('err', '無法切換到設定頁');
        }
      }

      // ── 即時驗證（重複） ──
      const numErr = computed(() => {
        if (!form.number || !form.number.toString().trim()) return false;
        const t = form.number.toString().trim();
        return symbols.value.some(s => s.id !== selectedId.value && s.number === t);
      });
      const nameErr = computed(() => {
        if (!form.name || !form.name.trim()) return false;
        const t = form.name.trim();
        return symbols.value.some(s => s.id !== selectedId.value && s.name === t);
      });

      // ── 寫表單回工作區 ──
      function writeForm() {
        if (selectedId.value === null) return;
        const idx = symbols.value.findIndex(s => s.id === selectedId.value);
        if (idx === -1) return;
        // 重複 → 不寫（UI 已顯示紅框）
        if (numErr.value || nameErr.value) return;

        const cur = symbols.value[idx];
        // v6.1:整理 pay_rows(限 2–20 連、去除無效列、依連線數排序)並回填 pay_3x–6x 相容欄
        const cleanRows = (form.pay_rows || [])
          .map(r => ({ count: Math.max(2, Math.min(20, Math.round(Number(r.count) || 0))), pay: Number(r.pay) || 0 }))
          .filter(r => r.count >= 2)
          .sort((a, b) => a.count - b.count);
        const payByCount = {};
        cleanRows.forEach(r => { payByCount[r.count] = r.pay; });
        const updated = {
          ...cur,
          name: form.name.toString().trim(),
          weight: Number(form.weight) || 0,
          use_max: !!form.use_max,
          max_count: form.use_max ? Math.max(1, Number(form.max_count) || 1) : Number(form.max_count) || 0,
          reel_limit: [...form.reel_limit],
          subreel_limit: { ...form.subreel_limit },
          // 擴充欄位
          symbol_id: form.symbol_id.toString().trim(),
          type: normalizeType(form.type),
          pay_rows: cleanRows,                       // v6.1:主要欄位
          pay_3x: Number(payByCount[3]) || 0,        // 以下為向下相容(由 pay_rows 同步)
          pay_4x: Number(payByCount[4]) || 0,
          pay_5x: Number(payByCount[5]) || 0,
          pay_6x: Number(payByCount[6]) || 0,
          mult_values: _cleanMultValues(form.mult_values),     // v6.3 / Q3
          prize_values: _cleanPrizeValues(form.prize_values),  // v6.3 / Q3
          mega_w: Math.max(1, Number(form.mega_w) || 1),
          mega_h: Math.max(1, Number(form.mega_h) || 1),
          can_expand: !!form.can_expand,
          is_wild: !!form.is_wild,
          is_scatter: !!form.is_scatter,
          image: (form.image != null && typeof form.image === 'string') ? form.image : null,  // v7.9 #4
        };
        // 替換陣列元素（用 splice 確保 Vue 偵測）
        symbols.value.splice(idx, 1, updated);
        commit();
      }

      // ── 防抖動：拖滑桿快速移動時不要每次都 commit ──
      let writeTimer = null;
      function onFieldEdit() {
        if (writeTimer) clearTimeout(writeTimer);
        writeTimer = setTimeout(writeForm, 150);
      }

      // ── v6.1:動態賠付表 helpers ──
      //   優先用全站 SP.migratePayRows(載入順序晚於本檔,執行期已就緒);
      //   一律深拷貝成新物件,避免編輯 form 時改到工作區原資料。
      function _readPayRows(s) {
        let rows;
        if (SP && typeof SP.migratePayRows === 'function') {
          rows = SP.migratePayRows(s);
        } else if (Array.isArray(s.pay_rows) && s.pay_rows.length > 0) {
          rows = s.pay_rows;
        } else {
          rows = [];
          for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
            const v = s['pay_' + n + 'x'];
            if (v != null && Number(v) > 0) rows.push({ count: n, pay: Number(v) });
          }
          if (rows.length === 0) rows = [{ count: 3, pay: 0 }, { count: 4, pay: 0 }, { count: 5, pay: 0 }];
        }
        return rows.map(r => ({ count: Number(r.count) || 0, pay: Number(r.pay) || 0 }));
      }
      // ── #5:賠付連線數上限(連線型=盤面輪數;群集/任意=20) ──
      const maxPayCount = computed(() => Math.max(2, Number(spec.maxLineLength) || 20));

      // ── #5:新增連線數(自動取「最小未使用值」,做去重防呆) ──
      function addPayRow() {
        const rows = form.pay_rows;
        const used = new Set(rows.map(r => Number(r.count)));
        const hi = maxPayCount.value;
        let c = 2;
        while (c <= hi && used.has(c)) c++;
        if (c > hi) { emitStatus('err', `連線數已達上限(最多 ${hi} 連)`); return; }
        rows.push({ count: c, pay: 0 });
        onFieldEdit();
      }
      function removePayRow(i) {
        if (form.pay_rows.length <= 1) return;
        form.pay_rows.splice(i, 1);
        onFieldEdit();
      }
      // ── #5:連線數 +/-(跳過已使用值做去重,夾在 2..上限) ──
      function bumpPayCount(i, delta) {
        const rows = form.pay_rows;
        const used = new Set(rows.map((r, j) => (j !== i ? Number(r.count) : -1)));
        const lo = 2, hi = maxPayCount.value;
        let next = Number(rows[i].count) + delta;
        while (next >= lo && next <= hi && used.has(next)) next += delta;  // 跳過重複
        if (next < lo || next > hi) return;   // 沒有可用值就不動
        rows[i].count = next;
        onFieldEdit();
      }

      // ── #7:賠付表錯誤 / 警告(重複連線、超過輪數、賠率遞減) ──
      const payRowIssues = computed(() => {
        const issues = [];
        const rows = (form.pay_rows || []).filter(r => Number(r.count) >= 2);
        // 1. 重複連線數
        const counts = rows.map(r => Number(r.count));
        const dups = [...new Set(counts.filter((c, i) => counts.indexOf(c) !== i))];
        dups.forEach(c => issues.push(`⚠️ 有重複的 ${c} 連線`));
        // 2. 超過盤面輪數(僅連線型 LINE/WAYS/MEGAWAYS)
        if (spec.isLineLike) {
          [...new Set(counts.filter(c => c > spec.reelCount))]
            .forEach(c => issues.push(`⚠️ ${c} 連線超過盤面 ${spec.reelCount} 輪`));
        }
        // 3. 賠率遞減(連線數較多反而賠付較低)
        const sorted = rows.slice().sort((a, b) => a.count - b.count);
        for (let i = 1; i < sorted.length; i++) {
          if (Number(sorted[i].pay) < Number(sorted[i - 1].pay)) {
            issues.push(`⚠️ ${sorted[i].count} 連線賠率小於 ${sorted[i - 1].count} 連線`);
          }
        }
        return issues;
      });

      // ──────────────────────────────────────────────────────────
      //  v6.3 / Q3:倍數(×N)/ 彩金倍數(N×)/ 金幣面額
      //   modeNames:prize 各模式權重欄;jackpotOptions:link_jackpot 下拉
      //   兩者於 onMounted 載入,並提供 ⟳ 重讀(modes/JP 可能在其他分頁變動)
      // ──────────────────────────────────────────────────────────
      const modeNames = ref([]);
      const jackpotOptions = ref([]);
      function refreshMultRefs() {
        const HH = (SP && SP.ConfigEditor && SP.ConfigEditor.Helpers) || null;
        try {
          modeNames.value = HH && HH.loadModes
            ? HH.loadModes().map(m => String(m.mode || '')).filter(Boolean)
            : [];
        } catch (e) { modeNames.value = []; }
        try {
          jackpotOptions.value = HH && HH.loadJackpots
            ? HH.loadJackpots().map(j => ({ jp_id: j.jp_id, name: j.name || j.jp_id })).filter(j => j.jp_id)
            : [];
        } catch (e) { jackpotOptions.value = []; }
      }
      // prize 的 weight_by_mode 以目前 modeNames 補齊(缺的給 100;非數字歸 0)
      function _fillModeWeights(src) {
        const out = {};
        const m = (src && typeof src === 'object') ? src : {};
        (modeNames.value || []).forEach(name => {
          out[name] = (m[name] != null && !isNaN(Number(m[name]))) ? Number(m[name]) : 100;
        });
        // 保留 modeNames 以外但已存在的鍵(避免改模式名時丟資料)
        Object.keys(m).forEach(k => { if (out[k] == null) out[k] = Number(m[k]) || 0; });
        return out;
      }

      function addMultValue() {
        const mk = (SP.ConfigEditor && SP.ConfigEditor.Helpers && SP.ConfigEditor.Helpers.makeMultValueEntry)
          ? SP.ConfigEditor.Helpers.makeMultValueEntry : (a, b) => ({ mult: a || 2, weight: b || 100 });
        form.mult_values.push(mk(2, 100));
        onFieldEdit();
      }
      function removeMultValue(i) {
        form.mult_values.splice(i, 1);
        onFieldEdit();
      }
      function addPrizeValue() {
        form.prize_values.push({
          value: 1, weight: 100, link_jackpot: '',
          weight_by_mode: _fillModeWeights(null),
        });
        onFieldEdit();
      }
      function removePrizeValue(i) {
        form.prize_values.splice(i, 1);
        onFieldEdit();
      }

      // writeForm 用:整理 + 去重
      function _cleanMultValues(arr) {
        const seen = new Set();
        const out = [];
        (Array.isArray(arr) ? arr : []).forEach(v => {
          const mult = Number(v.mult) || 0;
          if (mult <= 0) return;            // 倍數須 > 0
          if (seen.has(mult)) return;       // 去重(同倍數)
          seen.add(mult);
          out.push({ mult, weight: Math.max(0, Number(v.weight) || 0) });
        });
        return out;
      }
      function _cleanPrizeValues(arr) {
        const seen = new Set();
        const out = [];
        (Array.isArray(arr) ? arr : []).forEach(v => {
          const value = Number(v.value) || 0;
          const link = (v.link_jackpot || '').toString().trim();
          if (value <= 0 && !link) return;  // 須有面額 或 連結 JP
          const key = value + '|' + link;
          if (seen.has(key)) return;        // 去重(同面額+JP)
          seen.add(key);
          const wbm = {};
          const src = (v.weight_by_mode && typeof v.weight_by_mode === 'object') ? v.weight_by_mode : {};
          Object.keys(src).forEach(k => { const n = Number(src[k]); if (!isNaN(n)) wbm[k] = n; });
          out.push({ value, weight: Math.max(0, Number(v.weight) || 0), link_jackpot: link, weight_by_mode: wbm });
        });
        return out;
      }

      // #8:切換副輪出現限制 ──
      function toggleSubLimit(key, checked) {
        form.subreel_limit[key] = !!checked;
        onFieldEdit();
      }

      // #9:Type 為單一來源,wild/scatter 由 Type 推導
      function setType(t) {
        form.type = t;
        form.is_wild = (t === 'WILD');
        form.is_scatter = (t === 'SCATTER');
        onFieldEdit();
      }
      const roleNote = computed(() => {
        if (form.is_wild) return '✦ 此符號為 Wild —— 可替代其他符號';
        if (form.is_scatter) return '★ 此符號為 Scatter —— 不受中獎線位置限制';
        return '';
      });

      // ── v7.9.3:卡片收合摘要 ──
      // 賠付表:目前有設定賠付(>0)的連線數,如 "3/4/5";皆未設定則回 ''
      const paySummary = computed(() => {
        const rows = (form.pay_rows || [])
          .filter(r => Number(r.count) >= 2 && Number(r.pay) > 0)
          .map(r => Number(r.count))
          .sort((a, b) => a - b);
        return rows.length ? rows.join('/') : '';
      });
      // 出現限制摘要:輪數/上限簡述
      const limitSummary = computed(() => {
        const parts = [];
        const reels = (form.reel_limit || []).filter(Boolean).length;
        const total = (form.reel_limit || []).length;
        if (total && reels < total) parts.push(`輪 ${reels}/${total}`);
        if (form.use_max && Number(form.max_count) > 0) parts.push(`上限 ${form.max_count}`);
        return parts.join(' · ');
      });
      // 圖示尺寸摘要
      const sizeSummary = computed(() => {
        const w = Number(form.mega_w) || 1, h = Number(form.mega_h) || 1;
        let s = `${w}×${h}`;
        if (form.can_expand) s += ' · 可擴張';
        return s;
      });
      // 倍數/彩金摘要
      const multSummary = computed(() => {
        const m = (form.mult_values || []).filter(v => Number(v.mult) > 0).length;
        const p = (form.prize_values || []).filter(v => Number(v.value) > 0 || (v.link_jackpot || '')).length;
        const parts = [];
        if (m) parts.push(`倍數 ${m}`);
        if (p) parts.push(`彩金 ${p}`);
        return parts.join(' · ');
      });
      // 規則摘要(v7.9.4:改「有 N 條規則」)
      const rulesSummary = computed(() => {
        const r = symbolRefs.value;
        const n = (r.constraints.length || 0) + (r.rules.length || 0) + (r.discards.length || 0);
        return n ? `有 ${n} 條規則` : '';
      });

      // ── v7.9.4:狀態點(收合後顯示「有沒有資料」的唯讀指示;非開關)──
      // 出現限制:reel_limit 非全選 或 use_max 開 → 視為「有設定」
      const hasLimit = computed(() => {
        const rl = form.reel_limit || [];
        const reelRestricted = rl.length > 0 && rl.some(x => !x);
        const subRestricted = Object.values(form.subreel_limit || {}).some(Boolean);
        const maxOn = !!form.use_max && Number(form.max_count) > 0;
        return reelRestricted || subRestricted || maxOn;
      });
      // 倍數/彩金:任一陣列有有效 entry → 「有設定」
      const hasMult = computed(() => {
        const m = (form.mult_values || []).some(v => Number(v.mult) > 0);
        const p = (form.prize_values || []).some(v => Number(v.value) > 0 || (v.link_jackpot || ''));
        return m || p;
      });

      // #10:Mega 尺寸加減(1..10,防呆夾住範圍)
      function bumpMega(dim, delta) {
        const key = dim === 'w' ? 'mega_w' : 'mega_h';
        const next = Math.min(10, Math.max(1, (Number(form[key]) || 1) + delta));
        form[key] = next;
        onFieldEdit();
      }
      function resetMega() {
        form.mega_w = 1;
        form.mega_h = 1;
        showMega.value = false;   // #9:還原後收回展開狀態,回到 1×1 badge 畫面
        onFieldEdit();
      }

      // ════════════════════════════════════════════════════════
      //  #4:排序(上下移 / 拖曳)+ 自動編號
      // ════════════════════════════════════════════════════════
      const dragIdx = ref(-1);
      const dragOverIdx = ref(-1);
      const dragHandleArmed = ref(false);   // v7.9 #3:只有從 ⠿ 把手按下才允許拖曳

      // 依「啟用中符號的上到下順序」自動指派編號 00,01,...;停用的不佔號(number='')
      function renumber() {
        let n = 0, changed = false;
        symbols.value.forEach(s => {
          const want = (s.enabled !== false) ? String(n++).padStart(2, '0') : '';
          if (s.number !== want) { s.number = want; changed = true; }
        });
        return changed;
      }

      function moveSymbolTo(from, to) {
        if (from === to || from < 0 || to < 0) return;
        if (from >= symbols.value.length || to >= symbols.value.length) return;
        flushWrite();
        const arr = symbols.value.slice();
        const [item] = arr.splice(from, 1);
        arr.splice(to, 0, item);
        symbols.value = arr;
        renumber();
        commit();
      }
      function moveSymbol(i, dir) { moveSymbolTo(i, i + dir); }

      // 原生拖曳排序(v7.9 #3:只有從把手起拖才允許,避免與點選衝突)
      function onDragStart(i, e) {
        if (!dragHandleArmed.value) {
          if (e) e.preventDefault();   // 不是從把手起拖 → 取消
          return;
        }
        dragIdx.value = i;
        if (e && e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', String(i)); } catch (_) {}
        }
      }
      function onDragOver(i, e) {
        if (dragIdx.value < 0) return;   // 未在拖曳中
        if (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }
        dragOverIdx.value = i;
      }
      function onDrop(i) {
        if (dragIdx.value >= 0 && dragIdx.value !== i) moveSymbolTo(dragIdx.value, i);
        dragIdx.value = -1; dragOverIdx.value = -1; dragHandleArmed.value = false;
      }
      function onDragEnd() { dragIdx.value = -1; dragOverIdx.value = -1; dragHandleArmed.value = false; }

      // ════════════════════════════════════════════════════════
      //  選取 / 新增 / 刪除
      // ════════════════════════════════════════════════════════
      function select(sid) {
        // 切換前先把當前的寫回
        if (selectedId.value !== sid) {
          if (writeTimer) clearTimeout(writeTimer);
          writeForm();
          selectedId.value = sid;
          const s = symbols.value.find(x => x.id === sid);
          if (s) loadForm(s);
        }
      }

      // v4.0 / #13:切換符號啟用/停用(暫停而非刪除;停用的符號不匯出、不進權重同步)
      function toggleEnabled(sid) {
        const s = symbols.value.find(x => x.id === sid);
        if (!s) return;
        flushWrite();
        s.enabled = (s.enabled === false);   // false → true / 其他 → false
        renumber();   // #4:啟用集合變動 → 重新編號(停用不佔號、自動遞延)
        commit();
        emitStatus('ok', s.enabled ? `已啟用「${s.name || '(未命名)'}」` : `已停用「${s.name || '(未命名)'}」(資料保留)`);
      }

      function addSymbol() {
        // 先寫回當前編輯
        flushWrite();
        const newS = SP.createSymbol('', '', 100, reelCount.value);
        symbols.value.push(newS);
        const idx = symbols.value.length - 1;
        swatchMap.value[newS.id] = [...SWATCH_COLORS[idx % SWATCH_COLORS.length]];
        renumber();   // #4:依排序自動指派編號
        commit();
        select(newS.id);
        emitStatus('ok', `已新增 symbol（編號 #${newS.number}）`);
      }

      function deleteSelected() {
        if (selectedId.value === null) return;
        const s = selected.value;
        if (!s) return;
        const name = s.name || (s.number ? `#${s.number}` : `id=${s.id}`);
        if (!confirm(
          `確定要刪除「${name}」嗎？\n\n` +
          `套用後，盤面中所有填入此 symbol 的格子將清空。\n` +
          `此操作可透過「復原」取回。`
        )) return;

        flushWrite();
        const idx = symbols.value.findIndex(x => x.id === selectedId.value);
        if (idx === -1) return;
        symbols.value.splice(idx, 1);
        delete swatchMap.value[selectedId.value];

        // 選下一個
        if (symbols.value.length) {
          const nidx = Math.min(idx, symbols.value.length - 1);
          selectedId.value = symbols.value[nidx].id;
          loadForm(symbols.value[nidx]);
        } else {
          selectedId.value = null;
        }
        renumber();   // #4:刪除後重新編號
        commit();
        emitStatus('ok', `已刪除「${name}」`);
      }

      // ════════════════════════════════════════════════════════
      //  Swatch 選色
      // ════════════════════════════════════════════════════════
      function pickSwatch(i) {
        if (selectedId.value === null) return;
        flushWrite();
        swatchMap.value[selectedId.value] = [...SWATCH_COLORS[i]];
        // 觸發 reactive 更新
        swatchMap.value = { ...swatchMap.value };
        commit();
      }

      function isCurrentSwatch(i) {
        if (selectedId.value === null) return false;
        const cur = swatchMap.value[selectedId.value];
        return cur && cur[0] === SWATCH_COLORS[i][0];
      }

      // #3:自訂色票 — 任意色票選色
      function _contrastFg(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return '#2a2a2a';
        const n = parseInt(m[1], 16);
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;   // 感知亮度
        return lum > 150 ? '#2a2a2a' : '#ffffff';
      }
      const currentBg = computed(() => {
        if (selectedId.value === null) return '#DABA90';
        const cur = swatchMap.value[selectedId.value];
        return (cur && cur[0]) || '#DABA90';
      });
      // 目前顏色不在 12 個預設內 → 視為自訂色
      const isCustomSwatch = computed(() => {
        if (selectedId.value === null) return false;
        const bg = currentBg.value;
        return !SWATCH_COLORS.some(c => c[0].toLowerCase() === String(bg).toLowerCase());
      });
      function pickCustom(hex) {
        if (selectedId.value === null || !hex) return;
        flushWrite();
        swatchMap.value[selectedId.value] = [hex, _contrastFg(hex)];
        swatchMap.value = { ...swatchMap.value };
        commit();
      }

      function swatchStyle(sid) {
        const sw = swatchMap.value[sid] || ['#EDD9C0', '#7a5a3a'];
        return { background: sw[0], color: sw[1] };
      }

      // ════════════════════════════════════════════════════════
      //  v7.9 #4:符號圖片 — 上傳檔 / 貼上剪貼簿 / 清除
      //   圖片以 dataURL 存進 form.image → writeForm → registry(LS);
      //   不進 A.xlsx 契約。為避免 LS 爆量,上傳時縮放到 ≤256px、轉 webp/png。
      // ════════════════════════════════════════════════════════
      const IMG_MAX = 256;          // 最長邊上限(px)
      const IMG_BYTES_WARN = 600000; // 縮放後 dataURL 仍超過約 600KB → 警告

      function _downscaleToDataURL(srcDataURL) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            let { width: w, height: h } = img;
            if (w > IMG_MAX || h > IMG_MAX) {
              const scale = IMG_MAX / Math.max(w, h);
              w = Math.round(w * scale); h = Math.round(h * scale);
            }
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            let out;
            try { out = cv.toDataURL('image/webp', 0.85); }
            catch (e) { out = cv.toDataURL('image/png'); }
            if (!out || out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/png');
            resolve(out);
          };
          img.onerror = () => reject(new Error('圖片解析失敗'));
          img.src = srcDataURL;
        });
      }

      function _readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = () => reject(new Error('讀取檔案失敗'));
          fr.readAsDataURL(file);
        });
      }

      async function _applyImageFromFile(file) {
        if (selectedId.value === null) { emitStatus('err', '請先選取一個 symbol'); return; }
        if (!file || !/^image\//.test(file.type || '')) { emitStatus('err', '不是有效的圖片檔'); return; }
        try {
          const raw = await _readFileAsDataURL(file);
          const small = await _downscaleToDataURL(raw);
          if (small.length > IMG_BYTES_WARN) {
            emitStatus('warn', '圖片較大,已縮放;若 localStorage 容量不足可能存不下');
          }
          flushWrite();
          form.image = small;
          writeForm();
          emitStatus('ok', '已套用圖片(僅存本機,不匯出)');
        } catch (err) {
          emitStatus('err', '圖片處理失敗：' + err.message);
        }
      }

      function triggerImageUpload() {
        if (selectedId.value === null) { emitStatus('err', '請先選取一個 symbol'); return; }
        imageInput.value?.click();
      }
      async function onImageFile(e) {
        const file = e.target.files?.[0];
        if (file) await _applyImageFromFile(file);
        e.target.value = '';
      }

      async function pasteImage() {
        if (selectedId.value === null) { emitStatus('err', '請先選取一個 symbol'); return; }
        if (!navigator.clipboard || !navigator.clipboard.read) {
          emitStatus('err', '此瀏覽器不支援讀取剪貼簿,請改用「上傳圖片」或直接 Ctrl+V');
          return;
        }
        try {
          const items = await navigator.clipboard.read();
          for (const it of items) {
            const type = (it.types || []).find(t => t.startsWith('image/'));
            if (type) {
              const blob = await it.getType(type);
              await _applyImageFromFile(new File([blob], 'pasted', { type }));
              return;
            }
          }
          emitStatus('err', '剪貼簿沒有圖片');
        } catch (err) {
          emitStatus('err', '讀取剪貼簿失敗(可能未授權)：' + err.message);
        }
      }

      // 全域 Ctrl+V 貼上(僅在 symbols 頁、有選取、焦點不在輸入框時)
      async function onGlobalPaste(e) {
        if (selectedId.value === null) return;
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
        const items = (e.clipboardData && e.clipboardData.items) || [];
        for (const it of items) {
          if (it.kind === 'file' && /^image\//.test(it.type)) {
            const file = it.getAsFile();
            if (file) { e.preventDefault(); await _applyImageFromFile(file); return; }
          }
        }
      }

      function clearImage() {
        if (selectedId.value === null) return;
        flushWrite();
        form.image = null;
        writeForm();
        emitStatus('ok', '已移除圖片,改回色票顯示');
      }

      function initialOf(s) {
        if (!s) return '?';
        if (s.name) return s.name.slice(0, 2);
        if (s.number !== '' && s.number != null) return s.number;
        return '?';
      }

      const totalWeight = computed(() =>
        symbols.value.reduce((a, s) => a + (Number(s.weight) || 0), 0)
      );

      function pctOf(s) {
        const tw = totalWeight.value;
        if (!tw) return '0.0';
        return ((s.weight / tw) * 100).toFixed(1);
      }

      // ════════════════════════════════════════════════════════
      //  Mega 尺寸視覺預覽(任務 1)
      //   讀 LS 取得當前 02_Layout 的 reel 數與 max_rows,畫小盤面
      //   高亮 mega_w × mega_h 區域(從左上角 R1 開始放)
      // ════════════════════════════════════════════════════════
      const megaPreview = computed(() => {
        // 嘗試從 LS 讀 02_Layout
        let layoutRows = [];
        try {
          const raw = localStorage.getItem('slotplanner.aconfig.layout.v1');
          if (raw) layoutRows = JSON.parse(raw) || [];
        } catch (e) {}

        // 退路:沒有設定就用 5×3 預設盤
        let reelCols, maxRows;
        if (layoutRows.length > 0) {
          reelCols = layoutRows.length;
          maxRows = Math.max(...layoutRows.map(r => Number(r.max_rows) || 3), 3);
        } else {
          reelCols = reelCount.value || 5;
          maxRows = 3;
        }

        // 限制盤面顯示尺寸(最大 8x8,超出就視為截斷顯示)
        const dispCols = Math.min(reelCols, 8);
        const dispRows = Math.min(maxRows, 8);

        // 動態計算 cell size:盤面寬最多 160px
        const maxBoardW = 160;
        const cellSize = Math.floor(Math.min(maxBoardW / dispCols, 28));
        const padding = 4;
        const labelH = 12;

        const svgW = dispCols * cellSize + padding * 2;
        const svgH = dispRows * cellSize + padding * 2 + labelH;

        const mw = Math.max(1, Number(form.mega_w) || 1);
        const mh = Math.max(1, Number(form.mega_h) || 1);
        const clipped = (mw > reelCols) || (mh > maxRows);

        const cells = [];
        for (let r = 0; r < dispRows; r++) {
          for (let c = 0; c < dispCols; c++) {
            const inMega = (c < mw && r < mh);
            // 標記「超出可見盤但屬於 mega」的格子(只在 mega 比顯示盤大時觸發)
            const isClipMarker = inMega && (c >= dispCols || r >= dispRows);
            cells.push({
              k: `${r}-${c}`,
              x: padding + c * cellSize,
              y: padding + r * cellSize,
              on: inMega,
              clip: false,
            });
          }
        }

        // 計算 mega 外框(只當 >1x1 才顯示)
        let megaRect = null;
        if (mw > 1 || mh > 1) {
          const visW = Math.min(mw, dispCols);
          const visH = Math.min(mh, dispRows);
          megaRect = {
            x: padding,
            y: padding,
            w: visW * cellSize - 1.5,
            h: visH * cellSize - 1.5,
          };
        }

        const colLabelY = padding + dispRows * cellSize + labelH - 2;
        const colLabelX = (i) => padding + (i - 1) * cellSize + cellSize / 2;

        return {
          viewBox: `0 0 ${svgW} ${svgH}`,
          svgWidth: svgW,
          svgHeight: svgH,
          cellSize,
          cells,
          megaRect,
          reelCols,
          maxRows,
          dispCols,
          dispRows,
          clipped,
          colLabelY,
          colLabelX,
        };
      });

      // ════════════════════════════════════════════════════════
      //  (v6.2 #1:已移除 Undo/Redo;pushUndo 保留為「變動前 flush 待寫入」的內部別名)
      // ════════════════════════════════════════════════════════
      function pushUndo() { flushWrite(); }

      // ════════════════════════════════════════════════════════
      //  JSON 匯入匯出 / 重設
      // ════════════════════════════════════════════════════════
      function exportJson() {
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        const data = registry.toJSON();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `slotplanner-symbols-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        emitStatus('ok', `已匯出 ${data.symbols.length} 個 symbol 為 JSON`);
      }

      function triggerImport() { importInput.value?.click(); }

      async function importJson(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!data || !Array.isArray(data.symbols)) {
            alert('檔案格式錯誤：缺少 symbols 陣列');
            return;
          }
          if (!confirm(
            `即將匯入 ${data.symbols.length} 個 symbol，當前 ${symbols.value.length} 個 symbol 將被覆寫。\n\n確定要繼續嗎？`
          )) return;

          pushUndo();
          registry.fromJSON(data);
          // syncFromRegistry 會由 emit('changed') 觸發
          emitStatus('ok', `已匯入 ${data.symbols.length} 個 symbol`);
        } catch (err) {
          alert(`匯入失敗：${err.message}`);
          emitStatus('err', `匯入失敗：${err.message}`);
        } finally {
          e.target.value = '';
        }
      }

      function resetDefaults() {
        if (!confirm(
          '確定要重設為預設 15 個 symbol 嗎？\n\n' +
          '目前所有 symbol（含名稱、權重、顏色等）將被覆寫，' +
          '此操作可透過「復原」取回。'
        )) return;
        pushUndo();
        registry.initDefaults(reelCount.value);
        commit();
        emitStatus('ok', '已重設為預設 symbol');
      }

      // ════════════════════════════════════════════════════════
      //  狀態列訊息
      // ════════════════════════════════════════════════════════
      function emitStatus(type, msg) {
        emit('status', { type, msg });
      }

      // ════════════════════════════════════════════════════════
      //  鍵盤快捷鍵
      // ════════════════════════════════════════════════════════
      function onKeyDown(e) {
        // v6.2 #1:Undo/Redo 已移除;僅保留 Delete 刪除選取
        const inField = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
        if (!inField && e.key === 'Delete' && selectedId.value !== null) {
          e.preventDefault(); deleteSelected();
        }
      }

      // ════════════════════════════════════════════════════════
      //  生命週期
      // ════════════════════════════════════════════════════════
      let unsubChanged = null;
      let unsubSpec = null;
      onMounted(() => {
        unsubChanged = registry.on('changed', syncFromRegistry);
        // 連動層:先刷新一次 gameSpec(讀最新 layout/副輪),再鏡像;並訂閱後續變動
        if (gameSpec) {
          try { gameSpec.refresh(); } catch (e) {}
          syncSpec();
          unsubSpec = gameSpec.on('changed', syncSpec);
        }
        syncFromRegistry();
        refreshMultRefs();   // v6.3 / Q3:載入模式名 + JP 選項
        // #4:載入時依新模型(啟用順序)正規化編號一次;有變才寫回
        if (renumber()) commit();
        // 自動選第一個 symbol(行動版不自動選,讓使用者先看清單)
        let _isMobile = false;
        try { _isMobile = window.matchMedia('(max-width: 767px)').matches; } catch (e) {}
        if (symbols.value.length && selectedId.value === null && !_isMobile) {
          select(symbols.value[0].id);
        }
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('paste', onGlobalPaste);   // v7.9 #4:Ctrl+V 貼上圖片
        // v7.6.1:行動版編輯抽屜 — 開=點符號;關=drag-follow(往右拖編輯面關閉,跟手)
        try {
          const _el = document.querySelector('.sym-right');
          const _drag = window.SlotPlanner && window.SlotPlanner.attachDrawerDrag;
          if (_el && _drag) {
            _detachSymSwipe = _drag(_el, {
              side: 'right',
              isOpen:  () => !!selectedId.value,
              onClose: () => { select(null); },
            });
          }
        } catch (e) { /* 手勢掛載失敗不影響功能 */ }
        emitStatus('wait', `共 ${symbols.value.length} 個 symbol，總權重 ${totalWeight.value}`);
      });

      onBeforeUnmount(() => {
        if (_detachSymSwipe) { try { _detachSymSwipe(); } catch (e) {} _detachSymSwipe = null; }
        if (writeTimer) { clearTimeout(writeTimer); writeForm(); }
        if (unsubChanged) unsubChanged();
        if (unsubSpec) unsubSpec();
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('paste', onGlobalPaste);
      });

      return {
        SWATCH_COLORS,
        SYMBOL_TYPES,
        symbols, swatchMap, reelCount,
        spec, maxPayCount, payRowIssues,
        symbolRefs, refreshSymbolRefs, addRelatedConstraint,
        selectedId, selected, form,
        numErr, nameErr,
        totalWeight,
        importInput,
        megaPreview,
        showMega, roleNote,
        cardOpen, toggleCard,
        paySummary, limitSummary, sizeSummary, multSummary, rulesSummary,
        hasLimit, hasMult,
        select, toggleEnabled, addSymbol, deleteSelected,
        moveSymbol, dragIdx, dragOverIdx, dragHandleArmed, onDragStart, onDragOver, onDrop, onDragEnd,
        pickSwatch, isCurrentSwatch, swatchStyle,
        currentBg, isCustomSwatch, pickCustom,
        imageInput, triggerImageUpload, onImageFile, pasteImage, clearImage,
        initialOf, pctOf,
        onFieldEdit, setType, bumpMega, resetMega,
        addPayRow, removePayRow, bumpPayCount, toggleSubLimit,
        modeNames, jackpotOptions, refreshMultRefs,
        addMultValue, removeMultValue, addPrizeValue, removePrizeValue,
        exportJson, triggerImport, importJson,
        resetDefaults,
      };
    },
  };

  window.SlotPlanner = window.SlotPlanner || {};
  window.SlotPlanner.SymbolPage = SymbolPage;
})();
