/* games.js — 5 款代表性遊戲的完整設定資料（給 driver.js 餵 localStorage）。
 * 挑選依據：涵蓋任務一新增的四項 DSL 擴充（fire_chance / METER_ADJUST /
 * cap_value / REVEAL_AS 相鄰擴散），同時涵蓋 cluster / hold&win / xWays / 純機率觸發
 * 等主流機制，最大化「驗證工具」的覆蓋率。
 * 欄位一律沿用 helpers.js / registry.js 的工廠函式，確保欄位齊全、格式與真實 App 產出一致。
 */
function buildGames(SP, H) {
  const createSymbol = SP.createSymbol;
  const makeReel = H.makeReel;
  const makeMode = H.makeMode;
  const makeRule = H.makeRule;
  const defaultBetConfig = H.defaultBetConfig;

  function sym(overrides) {
    const s = createSymbol(overrides.name || overrides.symbol_id, overrides.number || 0);
    return Object.assign(s, overrides);
  }

  // ════════════════════════════════════════════════════════════
  // 1) Sugar Rush（Pragmatic Play）—— Cluster pays + 格位倍數封頂（缺口4 cap_value）
  // ════════════════════════════════════════════════════════════
  const sugarRush = {
    slug: 'sugar_rush',
    docMeta: {
      game_name: 'Sugar Rush（示範還原）',
      game_overview: '7×7 相鄰群聚（Cluster Pays）糖果消除遊戲；中獎群聚消失後上方糖果下落補位（Tumble），' +
        '同時盤面隨機格位出現「Sugar Bomb」倍數格，倍數逐次翻倍並封頂 1024x。',
    },
    global: Object.assign({}, H.DEFAULT_GLOBAL, {
      pay_type: 'CLUSTER', cluster_min_size: 5, starting_mode: 'NG',
      output_prefix: 'SugarRush', payline_direction: 'LTR',
    }),
    layout: Array.from({ length: 7 }, (_, i) => ({ ...makeReel(i + 1), max_rows: 7, y_offset: 0 })),
    registry: { symbols: [
      sym({ name: 'PURPLE', symbol_id: 'PURPLE', number: 1, type: 'LOW',  pay_3x: 0, pay_4x: 0, pay_5x: 0.1, weight: 22, min_match: 5 }),
      sym({ name: 'BLUE',   symbol_id: 'BLUE',   number: 2, type: 'LOW',  pay_5x: 0.15, weight: 20, min_match: 5 }),
      sym({ name: 'GREEN',  symbol_id: 'GREEN',  number: 3, type: 'LOW',  pay_5x: 0.2,  weight: 18, min_match: 5 }),
      sym({ name: 'YELLOW', symbol_id: 'YELLOW', number: 4, type: 'HIGH', pay_5x: 0.5,  weight: 14, min_match: 5 }),
      sym({ name: 'ORANGE', symbol_id: 'ORANGE', number: 5, type: 'HIGH', pay_5x: 0.8,  weight: 12, min_match: 5 }),
      sym({ name: 'RED',    symbol_id: 'RED',    number: 6, type: 'HIGH', pay_5x: 1.5,  weight: 9,  min_match: 5 }),
      sym({ name: 'BOMB',   symbol_id: 'BOMB',   number: 7, type: 'SPECIAL', weight: 5, min_match: 999,
            wild_behavior: '', notes: 'Sugar Bomb：落定後以 REVEAL_AS 揭示為隨機倍數格' }),
    ] },
    symbolsets: { SETX: ['PURPLE','BLUE','GREEN','YELLOW','ORANGE','RED','BOMB'] },
    reelweights: { NG: { symbol_ids: ['PURPLE','BLUE','GREEN','YELLOW','ORANGE','RED','BOMB'],
      weights: (() => { const w = {}; const ids = ['PURPLE','BLUE','GREEN','YELLOW','ORANGE','RED','BOMB'];
        const base = [22,20,18,14,12,9,5];
        for (let r = 1; r <= 7; r++) ids.forEach((id, i) => { w[`${r}-${id}`] = base[i]; }); return w; })() } },
    paylines: [],
    modes: [
      Object.assign(makeMode('NG'), { notes: '一般遊戲；Cluster Pays + Tumble', cascade_enabled: true, cascade_max_depth: 50 }),
    ],
    // v8.8 R4 B-6 + v8.49 缺口4：格位倍數(MULT)逐次翻倍、封頂 1024x
    cellattrs: [
      { attr_id: 'CA1', reel: 3, row: 4, attr: 'MULT', value: '2',   mode_scope: 'ALL', notes: 'Sugar Bomb 初始倍數格', cap_value: '1024' },
      { attr_id: 'CA2', reel: 5, row: 2, attr: 'MULT', value: '4',   mode_scope: 'ALL', notes: 'Sugar Bomb 累積倍數格（同一格位連續命中翻倍）', cap_value: '1024' },
      { attr_id: 'CA3', reel: 4, row: 6, attr: 'MULT', value: '256', mode_scope: 'ALL', notes: '示範接近封頂的倍數格', cap_value: '1024' },
    ],
    rules: [
      Object.assign(makeRule('P001'), {
        trigger: 'ON_GRID_GENERATED', condition: '', priority: 100,
        description: 'Sugar Bomb 隨機出現於盤面任意格，揭示為 2/4/8/…/1024 倍數之一',
        actions: [{ atype: 'REVEAL_AS', params: { symbol: 'BOMB', pool: 'RANDOM', scope: 'CELL' } }],
      }),
      Object.assign(makeRule('P002'), {
        trigger: 'ON_WIN_RESOLVED', condition: 'win_contains.BOMB == 1', priority: 90,
        description: '中獎群聚內含 Sugar Bomb 倍數格 → 該筆贏分乘上倍數格數值（封頂由 02d Cap_Value 描述）',
        actions: [{ atype: 'MULTIPLY_VALUE', params: { factor: 'symbol_count.BOMB', target: 'cell_value' } }],
      }),
    ],
    betconfig: defaultBetConfig(),
  };

  // ════════════════════════════════════════════════════════════
  // 2) Money Train 3（Relax Gaming）—— Hold&Win + 計量條 + METER_ADJUST + persistent
  // ════════════════════════════════════════════════════════════
  const moneyTrain3 = {
    slug: 'money_train_3',
    docMeta: {
      game_name: 'Money Train 3（示範還原）',
      game_overview: '5×4 主遊戲 scatter-pay；三個 Money Cart 符號觸發 Hold&Win 收集賞金局，' +
        '局內數值符號逐回合黏著、Collector/Prosperity Train 等特殊列車符號會提升倍數或計量條容量。',
    },
    global: Object.assign({}, H.DEFAULT_GLOBAL, {
      pay_type: 'SCATTER', starting_mode: 'NG', output_prefix: 'MoneyTrain3',
    }),
    layout: Array.from({ length: 5 }, (_, i) => ({ ...makeReel(i + 1), max_rows: 4, y_offset: 0 })),
    registry: { symbols: [
      sym({ name: 'H1', symbol_id: 'H1', number: 1, type: 'HIGH', pay_3x: 5, pay_4x: 20, pay_5x: 100, weight: 12, min_match: 8 }),
      sym({ name: 'H2', symbol_id: 'H2', number: 2, type: 'HIGH', pay_3x: 4, pay_4x: 15, pay_5x: 80,  weight: 14, min_match: 8 }),
      sym({ name: 'L1', symbol_id: 'L1', number: 3, type: 'LOW',  pay_3x: 1, pay_4x: 5,  pay_5x: 20,  weight: 20, min_match: 8 }),
      sym({ name: 'CART', symbol_id: 'CART', number: 4, type: 'BONUS', is_scatter: true, weight: 3, min_match: 3,
            notes: 'Money Cart：3 顆觸發 Hold&Win 賞金局' }),
      sym({ name: 'COIN', symbol_id: 'COIN', number: 5, type: 'SPECIAL', weight: 8, min_match: 999,
            notes: '賞金局內攜帶現金值的收集符號（進 STAR_BAR / coin_pool 計量）' }),
      sym({ name: 'COLLECTOR', symbol_id: 'COLLECTOR', number: 6, type: 'SPECIAL', weight: 1, min_match: 999,
            notes: '賞金局特殊列車：落定後把盤面所有現金符收集值加總派彩' }),
      sym({ name: 'PROSPERITY', symbol_id: 'PROSPERITY', number: 7, type: 'SPECIAL', weight: 1, min_match: 999,
            notes: '賞金局特殊列車：提升本局收集計量條容量上限' }),
    ] },
    symbolsets: {
      SETX: ['H1','H2','L1','CART'],
      SETY: ['COIN','COLLECTOR','PROSPERITY'],
    },
    reelweights: { NG: { symbol_ids: ['H1','H2','L1','CART'],
      weights: (() => { const w = {}; const ids = ['H1','H2','L1','CART']; const base = [12,14,20,3];
        for (let r = 1; r <= 5; r++) ids.forEach((id, i) => { w[`${r}-${id}`] = base[i]; }); return w; })() },
      BONUS: { symbol_ids: ['COIN','COLLECTOR','PROSPERITY'],
        weights: (() => { const w = {}; const ids = ['COIN','COLLECTOR','PROSPERITY']; const base = [10,1,1];
          for (let r = 1; r <= 5; r++) ids.forEach((id, i) => { w[`${r}-${id}`] = base[i]; }); return w; })() } },
    paylines: [],
    modes: [
      Object.assign(makeMode('NG'), { notes: '一般遊戲；Scatter-Pay 8+ 同圖示' }),
      Object.assign(makeMode('BONUS'), {
        trigger_condition: 'symbol_count.CART >= 3', spin_count: 0, inherit_globals: false,
        mode_kind: 'COLLECTION', collect_enabled: true, respin_base: 3, respin_reset_on: 'NEW_SYMBOL',
        grid_expand_in_collect: false, allow_persistent: true, collect_target: 20,
        notes: 'Hold&Win 賞金局：3 回合起始，落新符即回補；黏著符每回合重跑逐局倍數成長',
      }),
    ],
    meters: [
      { meter_id: 'COIN_POOL', label: '賞金局現金池', mode_scope: 'BONUS', fill_source: 'COIN', fill_amount: 1,
        capacity: 20, reset_scope: 'FEATURE', on_full_action: '', link_jackpot: '', carry_over: false,
        notes: 'Prosperity Train 落定時以 METER_ADJUST(CAPACITY_ADD) 提升上限' },
    ],
    rules: [
      Object.assign(makeRule('P001'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'mode == BONUS', priority: 100,
        description: '賞金局內現金符落定 → 黏著並每回合重跑（逐局倍數成長示意）',
        persistent: true,
        actions: [{ atype: 'STICKY', params: { symbol: 'COIN', duration: 3, until: 'FEATURE', mult_growth: 1 } }],
      }),
      Object.assign(makeRule('P002'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'mode == BONUS', priority: 90,
        description: '現金符落定 → 賞金池計量 +1（METER_ADJUST VALUE_ADD）',
        actions: [{ atype: 'METER_ADJUST', params: { meter_id: 'COIN_POOL', op: 'VALUE_ADD', value: 1 } }],
      }),
      Object.assign(makeRule('P003'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'mode == BONUS AND symbol_count.PROSPERITY >= 1', priority: 95,
        description: 'Prosperity Train 落定 → 賞金池容量上限 +5（METER_ADJUST CAPACITY_ADD）',
        actions: [{ atype: 'METER_ADJUST', params: { meter_id: 'COIN_POOL', op: 'CAPACITY_ADD', value: 5 } }],
      }),
      Object.assign(makeRule('P004'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'mode == BONUS AND symbol_count.COLLECTOR >= 1', priority: 80,
        description: 'Collector Train 落定 → 收集盤面所有現金符數值直接派彩',
        actions: [{ atype: 'COLLECT', params: { target: 'JACKPOT', source: 'symbol_value' } },
                  { atype: 'PAY', params: { value: 'feature_value_total' } }],
      }),
    ],
    betconfig: Object.assign(defaultBetConfig(), { buy_feature_enabled: true }),
  };

  // ════════════════════════════════════════════════════════════
  // 3) Outlaws Inc（Hacksaw Gaming）—— Star Box 計量條，直接對應 METER_ADJUST 缺口3 範例
  // ════════════════════════════════════════════════════════════
  const outlawsInc = {
    slug: 'outlaws_inc',
    docMeta: {
      game_name: 'Outlaws Inc（示範還原）',
      game_overview: '5×4 Ways 遊戲；星星符號落定累積「Star Box」計量條，集滿開箱給予對應賞金或免費遊戲；' +
        '賞金箱開出的「補星／擴充箱體」效果分別對應計量條當前值與容量的動態調整。',
    },
    global: Object.assign({}, H.DEFAULT_GLOBAL, {
      pay_type: 'WAYS', starting_mode: 'NG', output_prefix: 'OutlawsInc',
    }),
    layout: Array.from({ length: 5 }, (_, i) => ({ ...makeReel(i + 1), max_rows: 4, y_offset: 0 })),
    registry: { symbols: [
      sym({ name: 'WILD', symbol_id: 'WILD', number: 1, type: 'WILD', is_wild: true, weight: 3, min_match: 3 }),
      sym({ name: 'H1', symbol_id: 'H1', number: 2, type: 'HIGH', pay_3x: 5, pay_4x: 20, pay_5x: 60, weight: 10, min_match: 3 }),
      sym({ name: 'L1', symbol_id: 'L1', number: 3, type: 'LOW', pay_3x: 1, pay_4x: 4, pay_5x: 12, weight: 22, min_match: 3 }),
      sym({ name: 'STAR', symbol_id: 'STAR', number: 4, type: 'SPECIAL', weight: 6, min_match: 999,
            notes: '射落星星：落定 +1 Star Box 計量' }),
      sym({ name: 'BOXOPEN', symbol_id: 'BOXOPEN', number: 5, type: 'SPECIAL', weight: 1, min_match: 999,
            notes: 'Star Box 集滿觸發的開箱結果符（純事件標記，無須落盤權重）' }),
    ] },
    symbolsets: { SETX: ['WILD','H1','L1','STAR'] },
    reelweights: { NG: { symbol_ids: ['WILD','H1','L1','STAR'],
      weights: (() => { const w = {}; const ids = ['WILD','H1','L1','STAR']; const base = [3,10,22,6];
        for (let r = 1; r <= 5; r++) ids.forEach((id, i) => { w[`${r}-${id}`] = base[i]; }); return w; })() } },
    paylines: [],
    modes: [
      Object.assign(makeMode('NG'), { notes: '一般遊戲；Ways 計分 + Star Box 計量常駐' }),
      Object.assign(makeMode('FG1'), {
        trigger_condition: 'global.star_box >= 100', spin_count: 10, inherit_globals: false,
        notes: 'Star Box 集滿觸發的免費遊戲',
      }),
    ],
    meters: [
      { meter_id: 'STAR_BAR', label: 'Star Box 集星計量', mode_scope: 'ALL', fill_source: 'STAR', fill_amount: 1,
        capacity: 100, reset_scope: 'FEATURE', on_full_action: 'AWARD_FREE_SPIN', link_jackpot: '', carry_over: true,
        notes: '集滿 100 顆星開箱；開箱結果依權重給「補星(VALUE_ADD)」或「擴充箱體(CAPACITY_ADD)」。' +
               'reset_scope=FEATURE + carry_over=true 表達「不隨局重置、跨局持久」（ResetScope 無 SESSION 值，以此組合逼近）' },
    ],
    rules: [
      Object.assign(makeRule('P001'), {
        trigger: 'ON_SYMBOL_LANDED', condition: '', priority: 100,
        description: '星星符落定 → Star Box 計量 +1',
        actions: [{ atype: 'METER_ADJUST', params: { meter_id: 'STAR_BAR', op: 'VALUE_ADD', value: 1 } }],
      }),
      Object.assign(makeRule('P002'), {
        trigger: 'ON_CUSTOM_EMIT', condition: 'event == "star_box_open_refill"', priority: 90,
        description: '開箱結果「補星」：Star Box 當前值直接 +N（不動容量）',
        actions: [{ atype: 'METER_ADJUST', params: { meter_id: 'STAR_BAR', op: 'VALUE_ADD', value: '10-30' } }],
      }),
      Object.assign(makeRule('P003'), {
        trigger: 'ON_CUSTOM_EMIT', condition: 'event == "star_box_open_expand"', priority: 90,
        description: '開箱結果「擴充箱體」：Star Box 容量上限 +N（取代容量寫死）',
        actions: [{ atype: 'METER_ADJUST', params: { meter_id: 'STAR_BAR', op: 'CAPACITY_ADD', value: '20-50' } }],
      }),
      Object.assign(makeRule('P004'), {
        trigger: 'ON_CUSTOM_EMIT', condition: 'event == "star_box_open_set"', priority: 90,
        description: '開箱結果「重新設定容量」：Star Box 容量直接設為固定值（CAPACITY_SET）',
        actions: [{ atype: 'METER_ADJUST', params: { meter_id: 'STAR_BAR', op: 'CAPACITY_SET', value: 150 } }],
      }),
    ],
    betconfig: defaultBetConfig(),
  };

  // ════════════════════════════════════════════════════════════
  // 4) San Quentin xWays（Nolimit City）—— Infectious 相鄰輪擴散（缺口2 REVEAL_AS spread）+ xNudge + xBomb
  // ════════════════════════════════════════════════════════════
  const sanQuentin = {
    slug: 'san_quentin_xways',
    docMeta: {
      game_name: 'San Quentin xWays（示範還原）',
      game_overview: '5×3 xWays 遊戲；佔位符號落定揭示為 Wild 並感染相鄰輪的同款佔位符（Infectious xWays），' +
        '搭配 xNudge 推移黏著倍數與 xBomb 相鄰炸開機制。',
    },
    global: Object.assign({}, H.DEFAULT_GLOBAL, {
      pay_type: 'WAYS', starting_mode: 'NG', output_prefix: 'SanQuentinXWays',
    }),
    layout: Array.from({ length: 5 }, (_, i) => ({ ...makeReel(i + 1), max_rows: 3, y_offset: 0 })),
    registry: { symbols: [
      sym({ name: 'WILD', symbol_id: 'WILD', number: 1, type: 'WILD', is_wild: true, wild_behavior: 'MULTIPLIER', weight: 2, min_match: 3 }),
      sym({ name: 'H1', symbol_id: 'H1', number: 2, type: 'HIGH', pay_3x: 8, pay_4x: 40, pay_5x: 150, weight: 9, min_match: 3 }),
      sym({ name: 'L1', symbol_id: 'L1', number: 3, type: 'LOW', pay_3x: 1, pay_4x: 5, pay_5x: 15, weight: 20, min_match: 3 }),
      sym({ name: 'MYST', symbol_id: 'MYST', number: 4, type: 'SPECIAL', weight: 4, min_match: 999,
            notes: '佔位符：落定後 REVEAL_AS 揭示為 Wild，並可感染相鄰輪的同款佔位符（Infectious）' }),
      sym({ name: 'BOMB', symbol_id: 'BOMB', number: 5, type: 'SPECIAL', weight: 2, min_match: 999,
            notes: 'xBomb 炸彈符：消除以自身為中心的相鄰範圍，可炸開封閉列' }),
      sym({ name: 'SCAT', symbol_id: 'SCAT', number: 6, type: 'SCATTER', is_scatter: true, weight: 1, min_match: 3 }),
    ] },
    symbolsets: { SETX: ['WILD','H1','L1','MYST','BOMB','SCAT'] },
    reelweights: { NG: { symbol_ids: ['WILD','H1','L1','MYST','BOMB','SCAT'],
      weights: (() => { const w = {}; const ids = ['WILD','H1','L1','MYST','BOMB','SCAT']; const base = [2,9,20,4,2,1];
        for (let r = 1; r <= 5; r++) ids.forEach((id, i) => { w[`${r}-${id}`] = base[i]; }); return w; })() } },
    paylines: [],
    modes: [
      Object.assign(makeMode('NG'), { notes: '一般遊戲；xWays 隨機佔位揭示 + Infectious 擴散' }),
      Object.assign(makeMode('FG1'), {
        trigger_condition: 'symbol_count.SCAT >= 3', spin_count: 10, inherit_globals: false,
        notes: 'xWays 免費遊戲，Infectious 擴散機率提升',
      }),
    ],
    rules: [
      Object.assign(makeRule('P001'), {
        trigger: 'ON_GRID_GENERATED', condition: '', priority: 100,
        description: '佔位符落定揭示為 Wild，並以 50% 機率感染左右相鄰 1 輪的同款佔位符（Infectious xWays 核心機制）',
        actions: [{ atype: 'REVEAL_AS', params: {
          symbol: 'MYST', pool: 'WILD', scope: 'CELL',
          spread: 'ADJACENT_REEL', spread_range: 1, spread_chance: 0.5,
        } }],
      }),
      Object.assign(makeRule('P002'), {
        trigger: 'ON_GRID_GENERATED', condition: 'mode == FG1', priority: 95,
        description: 'FG 內 Infectious 擴散機率提升至 75%（同動作，不同機率參數，供比對兩種強度）',
        mode_scope: 'FG1',
        actions: [{ atype: 'REVEAL_AS', params: {
          symbol: 'MYST', pool: 'WILD', scope: 'CELL',
          spread: 'ADJACENT_REEL', spread_range: 1, spread_chance: 0.75,
        } }],
      }),
      Object.assign(makeRule('P003'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'symbol_count.WILD >= 1', priority: 80,
        description: 'xNudge：Wild 每步推移 1 格，乘數隨推移步數 +1',
        actions: [{ atype: 'NUDGE', params: { symbol: 'WILD', direction: 'DOWN', full_reel: 'N', mult_per_step: 1 } }],
      }),
      Object.assign(makeRule('P004'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'symbol_count.BOMB >= 1', priority: 70,
        description: 'xBomb：以炸彈符為中心消除相鄰範圍，可炸開封閉列',
        actions: [{ atype: 'DESTROY_ADJACENT', params: { symbol: 'BOMB', radius: 1, open_rows: 'Y', anchor: 'SYMBOL' } }],
      }),
    ],
    betconfig: defaultBetConfig(),
  };

  // ════════════════════════════════════════════════════════════
  // 5) Fortune Rabbit（PG Soft）—— 純機率直觸發（缺口1 fire_chance）+ Prize 收集 Hold&Win
  // ════════════════════════════════════════════════════════════
  const fortuneRabbit = {
    slug: 'fortune_rabbit',
    docMeta: {
      game_name: 'Fortune Rabbit（示範還原）',
      game_overview: '5×3 連線遊戲；除了常見的 Scatter 觸發外，每個一般局皆有極低機率（無需任何圖示條件）' +
        '直接觸發 Prize 收集 Hold&Win 賞金局；賞金局內 Prize 符號攜帶隨機兔子倍數值。',
    },
    global: Object.assign({}, H.DEFAULT_GLOBAL, {
      pay_type: 'LINE', starting_mode: 'NG', output_prefix: 'FortuneRabbit',
    }),
    layout: Array.from({ length: 5 }, (_, i) => ({ ...makeReel(i + 1), max_rows: 3, y_offset: 0 })),
    registry: { symbols: [
      sym({ name: 'H1', symbol_id: 'H1', number: 1, type: 'HIGH', pay_3x: 5, pay_4x: 20, pay_5x: 100, weight: 10, min_match: 3 }),
      sym({ name: 'L1', symbol_id: 'L1', number: 2, type: 'LOW', pay_3x: 1, pay_4x: 4, pay_5x: 15, weight: 22, min_match: 3 }),
      sym({ name: 'SCAT', symbol_id: 'SCAT', number: 3, type: 'SCATTER', is_scatter: true, weight: 2, min_match: 3 }),
      sym({ name: 'PRIZE', symbol_id: 'PRIZE', number: 4, type: 'SPECIAL', weight: 8, min_match: 999,
            notes: '賞金局內 Prize 符號，攜帶隨機現金/兔子倍數值' }),
    ] },
    symbolsets: { SETX: ['H1','L1','SCAT'], SETY: ['PRIZE'] },
    reelweights: { NG: { symbol_ids: ['H1','L1','SCAT'],
      weights: (() => { const w = {}; const ids = ['H1','L1','SCAT']; const base = [10,22,2];
        for (let r = 1; r <= 5; r++) ids.forEach((id, i) => { w[`${r}-${id}`] = base[i]; }); return w; })() },
      BONUS: { symbol_ids: ['PRIZE'],
        weights: (() => { const w = {}; for (let r = 1; r <= 5; r++) w[`${r}-PRIZE`] = 10; return w; })() } },
    paylines: [
      { line_id: 1, path: '(1,1)-(2,1)-(3,1)-(4,1)-(5,1)', notes: '頂列' },
      { line_id: 2, path: '(1,2)-(2,2)-(3,2)-(4,2)-(5,2)', notes: '中列' },
      { line_id: 3, path: '(1,3)-(2,3)-(3,3)-(4,3)-(5,3)', notes: '底列' },
    ],
    modes: [
      Object.assign(makeMode('NG'), { notes: '一般遊戲；連線賠付 + 極低機率純機率直觸發賞金局' }),
      Object.assign(makeMode('FG1'), {
        trigger_condition: 'symbol_count.SCAT >= 3', spin_count: 8, inherit_globals: false,
        notes: 'Scatter ≥ 3 觸發的一般免費遊戲',
      }),
      Object.assign(makeMode('BONUS'), {
        mode_kind: 'COLLECTION', collect_enabled: true, respin_base: 3, respin_reset_on: 'NEW_SYMBOL',
        allow_persistent: false, notes: 'Prize 收集 Hold&Win 賞金局（可由 Scatter 或純機率直觸發進入）',
      }),
    ],
    rules: [
      Object.assign(makeRule('P001'), {
        trigger: 'ON_SPIN_START', condition: '', priority: 100, fire_chance: 0.004,
        description: '每局皆有 0.4% 機率（無任何圖示條件）直接觸發 Prize 收集賞金局',
        actions: [{ atype: 'SWITCH_MODE', params: { target: 'BONUS', inherit_globals: false } },
                  { atype: 'EMIT_EVENT', params: { name: 'bonus_direct_trigger' } }],
        emits: ['bonus_direct_trigger'],
      }),
      Object.assign(makeRule('P002'), {
        trigger: 'ON_GRID_GENERATED', condition: 'symbol_count.SCAT >= 3', priority: 90,
        description: 'Scatter ≥ 3 觸發一般免費遊戲（非機率式，供對照）',
        actions: [{ atype: 'SWITCH_MODE', params: { target: 'FG1', inherit_globals: false } }],
      }),
      Object.assign(makeRule('P003'), {
        trigger: 'ON_SYMBOL_LANDED', condition: 'mode == BONUS', priority: 80,
        description: '賞金局內 Prize 符落定 → 黏著並累計現金值',
        actions: [{ atype: 'STICKY', params: { symbol: 'PRIZE', duration: 3, until: 'FEATURE' } },
                  { atype: 'COLLECT', params: { target: 'coin_pool', source: 'symbol_value' } }],
      }),
    ],
    betconfig: defaultBetConfig(),
  };

  return [sugarRush, moneyTrain3, outlawsInc, sanQuentin, fortuneRabbit];
}

module.exports = { buildGames };
