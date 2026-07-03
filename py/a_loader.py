"""
A.xlsx 解析器與全分頁交叉驗證

職責:
  1. 讀取 A.xlsx 13 個分頁
  2. 解析為 schemas.AConfig
  3. 全分頁交叉驗證,任何錯誤拋 ConfigValidationError 並指出位置

驗證項目:
  - 01_Global: 必填欄位完整、starting_mode 在 11_Mode_Config 存在
  - 02_Layout: Reel_ID 連續、Max_Rows >= 1
  - 03_Symbols: Symbol_ID 唯一、Pay_3x..6x 數值合法
  - 04_Reel_Weights: 引用的 Symbol_ID 存在、Reel_ID 在 02_Layout 範圍、權重 > 0
  - 05_Grid_Size_Weights: Grid_Size <= Max_Rows、Mode 存在
  - 06_Paylines: 路徑座標合法(在不規則盤上有效)、★前 3 格重疊偵測★
  - 07_Constraints: Symbol_ID 存在、reels_allowed 在範圍
  - 08_Combo_Weights: 引用合法
  - 09_Puzzle_Rules: Priority 不重複、Trigger/Action 語法正確
  - 10_Discard_Rules: 條件語法正確
  - 11_Mode_Config: Mode 名稱唯一、starting_mode 存在
  - 12_Distribution_Bins: bin_edges 遞增、長度 >= 2
"""
from __future__ import annotations
import re
import warnings
import pandas as pd
from pathlib import Path
from collections import defaultdict
from typing import Any

from core.schemas import (
    BetConfig, BuyFeatureDef,
    Multipliers, MultValue, CoinValues, CoinDenom,
    BonusItem,
    AConfig, GlobalConfig, LayoutConfig, ReelLayout, PanelDef,
    SymbolDef, SymbolType,
    ReelWeight, GridSizeWeight, ComboWeightOverride,
    Payline, Constraint, ConstraintType,
    PuzzleRule, TriggerType,
    DiscardRule, DiscardType,
    ModeConfig, DistributionBin,
    ResetScope, TriggerPay, MultStackMode,
    GenLimit,
    PayType, WaysDirection,
    ConfigValidationError,
    RTPVariant, GambleConfig, CellAttr,
)
from core.condition_parser import parse_condition, parse_actions


# ============================================================
# 公開入口
# ============================================================
def load_a_config(path: str | Path) -> AConfig:
    """載入並驗證 A.xlsx,失敗拋 ConfigValidationError"""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"找不到 A 設定檔: {path}")

    sheets = pd.read_excel(path, sheet_name=None, dtype=object, engine="openpyxl")

    # 必要分頁存在性檢查
    required = [
        "01_Global", "02_Layout", "03_Symbols", "04_Reel_Weights",
        "06_Paylines", "07_Constraints", "09_Puzzle_Rules",
        "10_Discard_Rules", "11_Mode_Config", "12_Distribution_Bins",
    ]
    for s in required:
        if s not in sheets:
            raise ConfigValidationError(s, f"缺少必要分頁 {s}")

    global_cfg = _parse_global(sheets["01_Global"])
    layout = _parse_layout(sheets["02_Layout"])
    # v4.7/v4.8:02b_Panels 與 03b_Symbol_Sets 皆為選用分頁（純加法,舊檔無此 sheet → 空）
    layout.panels = _parse_panels(sheets.get("02b_Panels"))
    symbol_sets = _parse_symbol_sets(sheets.get("03b_Symbol_Sets"))
    symbols = _parse_symbols(sheets["03_Symbols"])
    reel_weights = _parse_reel_weights(sheets["04_Reel_Weights"], symbols, layout)
    grid_size_weights = _parse_grid_size_weights(
        sheets.get("05_Grid_Size_Weights"), layout
    )
    paylines = _parse_paylines(sheets["06_Paylines"], layout)
    constraints = _parse_constraints(sheets["07_Constraints"], symbols, layout)
    combo_weights = _parse_combo_weights(
        sheets.get("08_Combo_Weights"), symbols, layout
    )
    puzzle_rules = _parse_puzzle_rules(sheets["09_Puzzle_Rules"])
    discard_rules = _parse_discard_rules(sheets["10_Discard_Rules"])
    modes = _parse_modes(sheets["11_Mode_Config"])
    _parse_mode_trigger_pays(sheets.get("11b_Mode_TriggerPays"), modes)   # v7.10 additive
    _parse_mode_items(sheets.get("11c_Mode_Items"), modes)                # v7.14 additive
    # v8.0:舊檔相容 — 若舊 A.xlsx 仍帶 17_Bonus_Games,讀入即遷移成 mode 玩法種類(併入 modes)。
    _migrate_bonus_games_to_modes(sheets.get("17_Bonus_Games"), modes)
    distribution_bins = _parse_distribution_bins(sheets["12_Distribution_Bins"])

    cfg = AConfig(
        global_cfg=global_cfg,
        layout=layout,
        symbols=symbols,
        reel_weights=reel_weights,
        grid_size_weights=grid_size_weights,
        paylines=paylines,
        constraints=constraints,
        combo_weights=combo_weights,
        puzzle_rules=puzzle_rules,
        discard_rules=discard_rules,
        modes=modes,
        distribution_bins=distribution_bins,
        symbol_sets=symbol_sets,   # v4.7:panel 獨立符號集
        raw_dataframes=sheets,   # 留存用於 B 文件「A 參數回填」
    )

    # v5.3:03c_Paytable（優先覆蓋 pay_table）
    _parse_paytable_03c(sheets.get('03c_Paytable'), cfg.symbols)

    # v5.3:14_Bet_Config（需 header=None 以位置存取多段版面）
    bet_df = None
    if "14_Bet_Config" in sheets:
        try:
            bet_df = pd.read_excel(path, sheet_name="14_Bet_Config",
                                   header=None, dtype=object, engine="openpyxl")
        except Exception:
            bet_df = None
    cfg.bet_config = _parse_bet_config(bet_df)

    # v8.6 / R5:14b_RTP_Variants(多市場 RTP 版本)+ 18_Gamble(比倍)。皆選用,舊檔安全降級。
    cfg.bet_config.rtp_variants = _parse_rtp_variants(sheets.get("14b_RTP_Variants"))
    cfg.gamble = _parse_gamble(sheets.get("18_Gamble"))

    # v5.4:15_Multipliers
    cfg.multipliers = _parse_multipliers(sheets.get('15_Multipliers'))

    # v5.4:16_Coin_Values（需 header=None 位置存取）
    coin_df = None
    if "16_Coin_Values" in sheets:
        try:
            coin_df = pd.read_excel(path, sheet_name="16_Coin_Values",
                                    header=None, dtype=object, engine="openpyxl")
        except Exception:
            coin_df = None
    cfg.coin_values = _parse_coin_values(coin_df)

    # v6.0-b:04b_Reel_Strips
    rs_enabled, rs_strips = _parse_reel_strips(sheets.get('04b_Reel_Strips'))
    cfg.reel_strips_enabled = rs_enabled
    cfg.reel_strips = rs_strips

    # v8.0:17_Bonus_Games 不再獨立載入(已於上方 _migrate_bonus_games_to_modes 併入 modes)。

    # v7.11:07b_Gen_Limits（產牌限制 / 生成期約束;選用,舊檔無 sheet → 空）
    cfg.gen_limits = _parse_gen_limits(sheets.get('07b_Gen_Limits'), symbols, layout)

    # v8.8 / R4 B-6:02d_Cell_Attributes(位置型格子屬性)。選用,舊檔安全降級。
    cfg.cell_attrs = _parse_cell_attrs(sheets.get('02d_Cell_Attributes'), layout)

    # 全分頁交叉驗證
    _cross_validate(cfg)
    return cfg


# ============================================================
# 各分頁解析
# ============================================================
def _col(r, *names, default=None):
    """欄名別名容錯讀取:依序嘗試多個欄名,回傳第一個非 NaN 的值。

    v4.8:前端 aconfig-xlsx.js 匯出的標頭與舊版 loader 期望的欄名
    曾經分裂（Mode_Scope vs Mode、Mega_W vs Mega_Width、
    Discard_ID vs Rule_ID 等）,造成整張表被靜默跳過或硬炸。
    此 helper 讓兩種命名都吃,維持新舊 A.xlsx 完全相容。
    """
    for n in names:
        v = r.get(n)
        if v is not None and not (isinstance(v, float) and pd.isna(v)) and not pd.isna(v):
            return v
    return default


def _parse_global(df: pd.DataFrame) -> GlobalConfig:
    sheet = "01_Global"
    if "Key" not in df.columns or "Value" not in df.columns:
        raise ConfigValidationError(sheet, "必須包含 Key 與 Value 兩欄")

    kv = {str(r["Key"]).strip(): r["Value"]
          for _, r in df.iterrows()
          if pd.notna(r.get("Key"))}

    def _need(key: str) -> Any:
        if key not in kv or pd.isna(kv[key]):
            raise ConfigValidationError(sheet, f"缺少必填 Key: {key}")
        return kv[key]

    try:
        cfg = GlobalConfig(
            simulation_count=int(_need("simulation_count")),
            random_seed=int(_need("random_seed")),
            output_prefix=str(_need("output_prefix")),
            pay_type=PayType(str(_need("pay_type")).strip().upper()),
            ways_direction=WaysDirection(str(kv.get("ways_direction", "LTR")).strip().upper()),
            cluster_min_size=int(kv.get("cluster_min_size", 5) or 5),
            starting_mode=str(_need("starting_mode")),
            max_chain_depth=int(kv.get("max_chain_depth", 100) or 100),
            max_chain_per_rule=int(kv.get("max_chain_per_rule", 50) or 50),
            big_win_thresholds=_parse_csv_floats(kv.get("big_win_thresholds", "100,500")),
            dead_spin_buckets=_parse_csv_ints(kv.get("dead_spin_buckets", "2,3,4,5")),
            # v8.7 / R6 A-4:雙向 WAYS 去重宣告(缺 key → True;規格描述,引擎不消費)
            ways_both_dedup=_to_bool(kv.get("ways_both_dedup", True)) if "ways_both_dedup" in kv else True,
        )
    except ValueError as e:
        raise ConfigValidationError(sheet, f"型別解析失敗: {e}")
    return cfg


def _parse_layout(df: pd.DataFrame) -> LayoutConfig:
    sheet = "02_Layout"
    reels = []
    for idx, r in df.iterrows():
        if pd.isna(r.get("Reel_ID")):
            continue
        try:
            reels.append(ReelLayout(
                reel_id=int(r["Reel_ID"]),
                y_offset=int(r.get("Y_Offset", 0) or 0),
                max_rows=int(r["Max_Rows"]),
                has_subreel=_to_bool(r.get("Has_SubReel")),
                subreel_position=_to_str(r.get("SubReel_Position")),
                subreel_rows=int(r.get("SubReel_Rows", 0) or 0),
                subreel_inherit_weight=_to_bool(r.get("SubReel_Inherit_Weight")),
                subreel_kind=(_to_str(r.get("SubReel_Kind")) or "STACK"),  # v4.6:空→STACK 向後相容
                subreel_symbol_set=_to_str(r.get("SubReel_Symbol_Set")),    # v5.1:選用欄,缺→空
                # v7.5-Layer C:主輪活格遮罩,選用欄,以欄名 .get 讀取（守則 #81）。缺欄/空 → None。
                cells=_parse_reel_cells(r.get("Cells"), int(r["Max_Rows"])),
            ))
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    if not reels:
        raise ConfigValidationError(sheet, "至少需要 1 個 Reel")
    # 排序並檢查 Reel_ID 連續
    reels.sort(key=lambda x: x.reel_id)
    expected = list(range(1, len(reels) + 1))
    actual = [r.reel_id for r in reels]
    if actual != expected:
        raise ConfigValidationError(
            sheet, f"Reel_ID 必須從 1 開始連續編號,目前: {actual}"
        )
    for r in reels:
        if r.max_rows < 1:
            raise ConfigValidationError(sheet, f"Reel {r.reel_id} 的 Max_Rows 必須 >= 1")
    return LayoutConfig(reels=reels)


def _parse_panels(df: pd.DataFrame | None) -> list[PanelDef]:
    """v4.7:02b_Panels 自由副盤。選用分頁,缺 sheet → []（向後相容）。"""
    if df is None:
        return []
    sheet = "02b_Panels"
    out: list[PanelDef] = []
    seen: set[str] = set()
    for idx, r in df.iterrows():
        pid = r.get("Panel_ID")
        if pd.isna(pid):
            continue
        pid = str(pid).strip()
        if not pid:
            continue
        if pid in seen:
            raise ConfigValidationError(sheet, f"Panel_ID 重複: {pid}", row=idx + 2)
        seen.add(pid)
        try:
            width = int(r.get("Width", 3) or 3)
            height = int(r.get("Height", 3) or 3)
            p = PanelDef(
                panel_id=pid,
                col=int(r.get("Col", 0) or 0),
                row=int(r.get("Row", 0) or 0),
                width=width,
                height=height,
                scroll=_to_bool(r.get("Scroll")),
                symbol_set=_to_str(r.get("Symbol_Set")),
                inherit_weight=_to_bool(r.get("Inherit_Weight")),
                join_payline=_to_bool(r.get("Join_Payline")),
                note=_to_str(r.get("Note")),
                # v7.x Layer B:選用欄,以欄名 .get 讀取（守則 #81）。缺欄 / 空 → None。
                cells=_parse_panel_cells(r.get("Cells"), width, height),
            )
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"Panel {pid} 解析失敗: {e}", row=idx + 2)
        if p.width < 1 or p.height < 1:
            raise ConfigValidationError(
                sheet, f"Panel {pid} 的 Width/Height 必須 >= 1", row=idx + 2
            )
        out.append(p)
    return out


def _parse_panel_cells(raw: Any, width: int, height: int) -> Optional[list[str]]:
    """v7.x Layer B:解析 02b_Panels 的 Cells 欄為活格遮罩 ["dx,dy",…]。

    收斂規則與前端 helpers.js `normalizeMask` 逐字對齊,確保 LS→A.xlsx→py
    round-trip 不變形:
      - NaN / None / 空字串 → None（整塊矩形,舊檔行為）
      - 以 ';' 或空白分隔,逐項比對 ^(-?\\d+),(-?\\d+)$
      - 越界（dx/dy < 0 或 >= width/height）裁掉
      - 去重；排序鍵 (dy, dx)（與 JS `ay-by || ax-bx` 一致）
      - 空 或 恰好填滿整個矩形（len == w*h）→ None（收斂成整塊矩形）
    """
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    s = str(raw).strip()
    if not s or s.lower() == "nan":
        return None
    w = max(1, int(width or 1))
    h = max(1, int(height or 1))
    seen: set[tuple[int, int]] = set()
    for tok in re.split(r"[;\s]+", s):
        tok = tok.strip()
        if not tok:
            continue
        m = re.match(r"^(-?\d+),(-?\d+)$", tok)
        if not m:
            continue
        dx, dy = int(m.group(1)), int(m.group(2))
        if 0 <= dx < w and 0 <= dy < h:
            seen.add((dx, dy))
    if not seen or len(seen) == w * h:
        return None
    ordered = sorted(seen, key=lambda t: (t[1], t[0]))
    return [f"{dx},{dy}" for (dx, dy) in ordered]
    """v4.7:03b_Symbol_Sets 符號集（panel 獨立符號集用）。選用分頁。"""
    if df is None:
        return {}
    out: dict[str, list[str]] = {}
    for _, r in df.iterrows():
        name = r.get("Set_Name")
        sid = r.get("Symbol_ID")
        if pd.isna(name) or pd.isna(sid):
            continue
        name = str(name).strip()
        sid = str(sid).strip()
        if not name or not sid:
            continue
        out.setdefault(name, [])
        if sid not in out[name]:
            out[name].append(sid)
    return out


def _parse_reel_cells(raw: Any, max_rows: int) -> Optional[list[str]]:
    """v7.5-Layer C:解析 02_Layout 的 Cells 欄為主輪活格遮罩 ["0,dy",…]。

    收斂規則與 _parse_panel_cells / 前端 normalizeMask 對齊,但主輪為單欄:
      - dx 恆為 0;非 0（理論上不該出現）一律忽略。
      - dy 範圍 [0, max_rows)；越界裁掉。
      - 去重、升冪（依 dy）。
      - 空 或 恰好填滿整欄（len == max_rows）→ None（收斂成實心欄,舊檔行為）。
    NaN / None / 空字串 → None（向後相容）。
    """
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    s = str(raw).strip()
    if not s or s.lower() == "nan":
        return None
    n = max(1, int(max_rows or 1))
    seen: set[int] = set()
    for tok in re.split(r"[;\s]+", s):
        tok = tok.strip()
        if not tok:
            continue
        m = re.match(r"^(-?\d+),(-?\d+)$", tok)
        if not m:
            continue
        dx, dy = int(m.group(1)), int(m.group(2))
        if dx == 0 and 0 <= dy < n:
            seen.add(dy)
    if not seen or len(seen) == n:
        return None
    return [f"0,{dy}" for dy in sorted(seen)]


def _parse_paytable_03c(df, symbols: dict) -> None:
    """v5.3: 03c_Paytable — Symbol_ID / Count / Pay。
    v8.3 / R1 A-1: 尾端 additive 欄 Count_From / Count_To(count 區間同賠;
    scatter-pays 8-9/10-11/12-30、大盤 cluster)。缺欄/同值 → 單點(向後相容)。
    區間列同步展開進 pay_table(from..to 每個 count 同賠)→ 引擎照舊消費
    pay_table、逐位元組不動;原始區間另存 SymbolDef.pay_ranges 供文件輸出。
    有值時覆蓋 symbols 的 pay_table（優先於 03_Symbols Pay_Nx 欄）。
    sheet 不存在或空 → 靜默跳過（向後相容）。
    """
    if df is None or df.empty:
        return
    _RANGE_SPAN_CAP = 512   # 防呆:單列區間最多展開 512 個 count(64 格盤綽綽有餘)
    for idx, r in df.iterrows():
        sid = r.get("Symbol_ID")
        if pd.isna(sid):
            continue
        sid = str(sid).strip()
        if sid not in symbols:
            continue
        try:
            count = int(r.get("Count", 0))
            pay = float(r.get("Pay", 0.0))
        except (ValueError, TypeError):
            continue
        # v8.3:by-name 讀區間欄(缺欄 → NaN → 單點)
        c_from, c_to = count, count
        try:
            v_from = r.get("Count_From")
            v_to = r.get("Count_To")
            if pd.notna(v_from):
                c_from = int(v_from)
            if pd.notna(v_to):
                c_to = int(v_to)
        except (ValueError, TypeError):
            c_from, c_to = count, count
        if c_from <= 0:
            c_from = count
        if c_to < c_from:
            c_to = c_from
        if c_to - c_from > _RANGE_SPAN_CAP:
            c_to = c_from + _RANGE_SPAN_CAP
        if c_from > 0:
            for c in range(c_from, c_to + 1):
                symbols[sid].pay_table[c] = pay
            if c_to > c_from:
                if symbols[sid].pay_ranges is None:
                    symbols[sid].pay_ranges = []
                symbols[sid].pay_ranges.append((c_from, c_to, pay))
        elif count > 0:
            symbols[sid].pay_table[count] = pay


def _parse_bet_config(df) -> "BetConfig":
    """v5.3: 14_Bet_Config（KV 區 + Buy Feature 清單）。
    sheet 不存在 → 回傳預設 BetConfig（向後相容）。
    版面：Row0 表頭 / Row1-4 Ante KV / Row5 空 / Row6 BF 子表頭 / Row7+ BF 列。
    """
    if df is None or df.empty:
        return BetConfig()

    def _cell(rr, cc):
        try:
            v = df.iloc[rr, cc]
            return None if pd.isna(v) else v
        except Exception:
            return None

    def _bool(v):
        if v is None:
            return False
        if isinstance(v, bool):
            return v
        return str(v).strip().upper() in ("TRUE", "1", "YES")

    bc = BetConfig()
    kv = {}
    # v8.6:KV 收集改「全表掃描」——新 KV 列(互斥/Feature Drop)為維持 BF 區位置(Row6/7+)
    #   一律附加在 sheet 尾端;掃描 col0 為已知 KV key 者即收。BF 列的 col0 為 BF_ID,不會撞名。
    for i in range(1, len(df)):
        k = _cell(i, 0)
        if k is not None and str(k).strip() in _BET_KV_KEYS:
            kv[str(k).strip()] = _cell(i, 1)
    bc.ante_bet_enabled = _bool(kv.get("Ante_Bet_Enabled", False))
    try:
        bc.ante_bet_mult = float(kv.get("Ante_Bet_Mult", 1.25) or 1.25)
    except (ValueError, TypeError):
        pass
    try:
        bc.ante_bet_trigger_mult = float(kv.get("Ante_Bet_Trigger_Mult", 2.0) or 2.0)
    except (ValueError, TypeError):
        pass
    bc.ante_bet_desc = str(kv.get("Ante_Bet_Desc", "") or "")
    # v8.6 / R5 E-15:互斥 + Feature Drop(尾端 KV;舊檔缺 → 預設)
    bc.ante_buy_exclusive = _bool(kv.get("Ante_Buy_Exclusive", False))
    bc.feature_drop_enabled = _bool(kv.get("Feature_Drop_Enabled", False))
    bc.feature_drop_desc = str(kv.get("Feature_Drop_Desc", "") or "")

    for i in range(7, len(df)):
        bf_id = _cell(i, 0)
        if not bf_id or pd.isna(bf_id):
            continue
        if str(bf_id).strip() in _BET_KV_KEYS:   # v8.6:尾端 KV 列不是 BF 列
            continue
        try:
            # v8.6 / R5 E-15:Kind(BF 表尾端第 7 欄;舊檔缺 → DIRECT;非法值 → 報錯)
            kind_raw = str(_cell(i, 6) or "").strip().upper()
            bf_kind = kind_raw or "DIRECT"
            if bf_kind not in _VALID_BF_KINDS:
                raise ConfigValidationError(
                    "14_Bet_Config",
                    f"Buy Feature '{bf_id}' 的 Kind '{kind_raw}' 非合法值"
                    f"({'/'.join(_VALID_BF_KINDS)} 或留空)",
                    row=i + 1)
            bc.buy_features.append(BuyFeatureDef(
                bf_id=str(bf_id).strip(),
                target_mode=str(_cell(i, 1) or "").strip(),
                cost_mult=float(_cell(i, 2) or 0),
                rtp_target=float(_cell(i, 3) or 0),
                enabled=_bool(_cell(i, 4)),
                notes=str(_cell(i, 5) or "").strip(),
                kind=bf_kind,
            ))
        except ConfigValidationError:
            raise
        except (ValueError, TypeError):
            continue
    return bc


# v8.6 / R5:14_Bet_Config KV 區合法 key(掃描式收集用)與 Buy Feature Kind 合法值
_BET_KV_KEYS = frozenset((
    "Ante_Bet_Enabled", "Ante_Bet_Mult", "Ante_Bet_Trigger_Mult", "Ante_Bet_Desc",
    "Ante_Buy_Exclusive", "Feature_Drop_Enabled", "Feature_Drop_Desc",
))
_VALID_BF_KINDS = ("DIRECT", "BOOST_RATE", "SUPER")
_VALID_GAMBLE_TYPES = ("CARD_COLOR", "CARD_SUIT", "LADDER", "WHEEL", "CUSTOM")


def _parse_rtp_variants(df) -> list:
    """v8.6 / R5 E-18:14b_RTP_Variants(多市場 RTP 出證版本;規格描述)。
    additive 契約:sheet 不存在 → [](安全降級)。by-name 讀。
    """
    out = []
    if df is None:
        return out
    sheet = "14b_RTP_Variants"
    for idx, r in df.iterrows():
        v = r.get("Variant")
        if pd.isna(v) or not str(v).strip():
            continue
        try:
            out.append(RTPVariant(
                variant=str(v).strip(),
                target_rtp=float(r.get("Target_RTP", 0) or 0),
                max_bet=float(r.get("Max_Bet", 0) or 0),
                notes=_to_str(r.get("Notes")),
            ))
        except (ValueError, TypeError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


def _parse_gamble(df) -> "GambleConfig":
    """v8.6 / R5 E-16:18_Gamble(比倍;KV 式 Key/Value/Notes)。
    additive 契約:sheet 不存在 → 預設 GambleConfig(停用;安全降級)。by-name 掃 Key 欄。
    """
    g = GambleConfig()
    if df is None or "Key" not in df.columns:
        return g
    sheet = "18_Gamble"
    kv = {}
    for _, r in df.iterrows():
        k = r.get("Key")
        if pd.isna(k) or not str(k).strip():
            continue
        kv[str(k).strip()] = r.get("Value")

    def _b(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return False
        if isinstance(v, bool):
            return v
        return str(v).strip().upper() in ("TRUE", "1", "YES", "Y")

    g.enabled = _b(kv.get("Gamble_Enabled"))
    gt_raw = _to_str(kv.get("Gamble_Type")).strip().upper()
    g.gamble_type = gt_raw or "CARD_COLOR"
    if g.gamble_type not in _VALID_GAMBLE_TYPES:
        raise ConfigValidationError(
            sheet, f"Gamble_Type '{gt_raw}' 非合法值({'/'.join(_VALID_GAMBLE_TYPES)} 或留空)")
    g.type_desc = _to_str(kv.get("Type_Desc"))
    g.win_mult_options = _to_str(kv.get("Win_Mult_Options")) or "2"
    g.max_rounds = int(kv.get("Max_Rounds", 5) or 0) if not pd.isna(kv.get("Max_Rounds", 5)) else 5
    try:
        g.cap_mult = float(kv.get("Cap_Mult", 0) or 0)
    except (ValueError, TypeError):
        g.cap_mult = 0.0
    at_raw = _to_str(kv.get("Applies_To")).strip().upper()
    g.applies_to = at_raw or "ALL_WINS"
    if g.applies_to not in ("ALL_WINS", "BELOW_LIMIT"):
        raise ConfigValidationError(
            sheet, f"Applies_To '{at_raw}' 非合法值(ALL_WINS/BELOW_LIMIT 或留空)")
    try:
        g.applies_limit = float(kv.get("Applies_Limit", 0) or 0)
    except (ValueError, TypeError):
        g.applies_limit = 0.0
    ca = kv.get("Collect_Anytime")
    g.collect_anytime = True if ca is None or (isinstance(ca, float) and pd.isna(ca)) else _b(ca)
    g.notes = _to_str(kv.get("Notes"))
    return g


def _parse_multipliers(df) -> "Multipliers":
    """v5.4: 15_Multipliers（Section/Key/Value/Weight/Notes 長表）。
    sheet 不存在 → 預設 Multipliers（向後相容）。
    """
    mp = Multipliers()
    if df is None or df.empty:
        return mp

    def _b(v):
        if isinstance(v, bool): return v
        return str(v).strip().upper() in ("TRUE", "1", "YES")

    for _, r in df.iterrows():
        sec = str(r.get("Section") or "").strip().upper()
        key = str(r.get("Key") or "").strip()
        val = r.get("Value")
        wt = r.get("Weight")
        if sec == "WILD":
            if key == "Enabled":
                mp.wild_mult_enabled = _b(val)
            elif key == "Fixed_Mult":
                try: mp.wild_mult_fixed = float(val)
                except (ValueError, TypeError): pass
            elif key == "Mult":
                try: mp.wild_mult_values.append(MultValue(float(val), float(wt or 0)))
                except (ValueError, TypeError): pass
        elif sec == "PROGRESS":
            if key == "Enabled":
                mp.progress_enabled = _b(val)
            elif key == "Reset_On_Mode":
                mp.progress_reset_on_mode = _b(val)
            elif key == "Ladder":
                mode = str(val or "").strip()
                arr = [float(x) for x in str(wt or "").split(",") if x.strip()]
                if mode and arr:
                    mp.progress_ladders[mode] = arr
        elif sec == "RANDOM":
            if key == "Enabled":
                mp.random_enabled = _b(val)
            elif key == "Symbol_ID":
                mp.random_symbol_id = str(val or "").strip()
            elif key == "Mult":
                try: mp.random_values.append(MultValue(float(val), float(wt or 0)))
                except (ValueError, TypeError): pass
    return mp


def _parse_coin_values(df) -> "CoinValues":
    """v5.4: 16_Coin_Values（前 2 列 KV、第 4 列起面額表;權重欄為 W_<mode>）。
    需 header=None 讀取（位置存取）。sheet 不存在 → 預設 CoinValues。
    """
    cv = CoinValues()
    if df is None or df.empty:
        return cv

    def _cell(rr, cc):
        try:
            v = df.iloc[rr, cc]
            return None if pd.isna(v) else v
        except Exception:
            return None

    def _b(v):
        if v is None: return False
        if isinstance(v, bool): return v
        return str(v).strip().upper() in ("TRUE", "1", "YES")

    cv.enabled = _b(_cell(0, 1))
    cv.coin_symbol_id = str(_cell(1, 1) or "COIN").strip()

    # 第 3 列（index 3）為面額表表頭：Label / Value / Link_Jackpot / W_<mode>...
    header_row = 3
    headers = []
    c = 0
    while True:
        h = _cell(header_row, c)
        if h is None and c > 2:
            break
        headers.append(str(h).strip() if h is not None else "")
        c += 1
        if c > 50:
            break
    mode_cols = [(i, h[2:]) for i, h in enumerate(headers) if h.startswith("W_")]

    for i in range(header_row + 1, len(df)):
        label = _cell(i, 0)
        val = _cell(i, 1)
        link = _cell(i, 2)
        if label is None and val is None and link is None:
            continue
        denom = CoinDenom(
            label=str(label or "").strip(),
            value=float(val or 0) if val is not None else 0.0,
            link_jackpot=str(link or "").strip(),
        )
        for (ci, mode) in mode_cols:
            w = _cell(i, ci)
            try:
                denom.weight_by_mode[mode] = float(w or 0)
            except (ValueError, TypeError):
                denom.weight_by_mode[mode] = 0.0
        cv.denominations.append(denom)
    return cv


def _parse_reel_strips(df):
    """v6.0-b: 04b_Reel_Strips — Mode_Scope / Reel_ID / Enabled / Strip_Sequence。
    回傳 (enabled, {mode: {reel_id: [sym,...]}})。sheet 不存在 → (False, {}).
    """
    if df is None or df.empty:
        return (False, {})
    enabled = False
    strips = {}
    for _, r in df.iterrows():
        mode = r.get("Mode_Scope")
        rid = r.get("Reel_ID")
        seq = r.get("Strip_Sequence")
        if pd.isna(mode) or pd.isna(rid) or pd.isna(seq):
            continue
        en = r.get("Enabled")
        if isinstance(en, bool):
            enabled = enabled or en
        elif str(en).strip().upper() in ("TRUE", "1", "YES"):
            enabled = True
        arr = [x.strip() for x in str(seq).split(",") if x.strip()]
        if not arr:
            continue
        try:
            rid_i = int(rid)
        except (ValueError, TypeError):
            continue
        strips.setdefault(str(mode).strip(), {})[rid_i] = arr
    return (enabled, strips)


def _migrate_bonus_games_to_modes(df, modes: dict) -> None:
    """v8.0:舊檔相容遷移器(取代 v6.0-c 的 _parse_bonus_games)。

    舊 A.xlsx 若仍帶 17_Bonus_Games(每 game 首列帶 game 欄、後續列僅 item 欄,carry-forward),
    讀入即轉成 mode 玩法種類(mode_kind = WHEEL/PICK/COLLECTION)併入 modes:
      - mode 名取 Bonus_ID;同名 mode 已存在(如已在 11_Mode_Config/11c 定義)→ 略過(避免覆蓋)。
      - Title/Trigger_Desc/Mode_Scope 併入 notes(lossy;trigger_condition 需人工重接,留 None)。
      - items 沿用 BonusItem。
    sheet 不存在 / 空 → 不動 modes(安全降級)。本工具不執行、不算 RTP。
    """
    if df is None or df.empty:
        return

    def _b(v):
        if isinstance(v, bool): return v
        return str(v).strip().upper() in ("TRUE", "1", "YES")

    def _s(v):
        return "" if pd.isna(v) else str(v).strip()

    def _n(v, cast=float):
        try: return cast(v)
        except (ValueError, TypeError): return cast(0)

    cur = None
    for _, r in df.iterrows():
        bid = _s(r.get("Bonus_ID"))
        if bid:
            if bid in modes:
                cur = None   # 同名 mode 已存在 → 該 game 略過
                continue
            kind = (_s(r.get("Type")) or "WHEEL").upper()
            if kind not in _VALID_MODE_KINDS or kind == "SPIN":
                kind = "WHEEL"
            notes_parts = []
            title = _s(r.get("Title"))
            tdesc = _s(r.get("Trigger_Desc"))
            mscope = _s(r.get("Mode_Scope"))
            if title and title != bid: notes_parts.append(title)
            if tdesc: notes_parts.append("觸發(舊):" + tdesc)
            if mscope and mscope.upper() != "ALL": notes_parts.append("原適用模式:" + mscope)
            cur = ModeConfig(
                mode=bid,
                trigger_condition=None,      # lossy:舊 trigger_desc 無法自動變 Condition,需人工重接
                spin_count=0,
                notes=" / ".join(notes_parts),
                mode_kind=kind,
                wheel_upgrade_to=_s(r.get("Upgrade_To")),
                pick_count=_n(r.get("Pick_Count"), int),
                collect_target=_n(r.get("Collect_Target"), int),
            )
            modes[bid] = cur
        if cur is None:
            continue
        label = _s(r.get("Item_Label"))
        val = r.get("Item_Value")
        link = _s(r.get("Item_Link_JP"))
        if label or (val is not None and not pd.isna(val) and _n(val) != 0) or link:
            cur.items.append(BonusItem(
                label=label,
                value=_n(val),
                weight=_n(r.get("Item_Weight")),
                is_end=_b(r.get("Item_Is_End")),
                link_jackpot=link,
            ))



# ── 03b_Symbol_Sets:符號集(v4.7;Set_Name/Symbol_ID 長格式攤平 → {set: [sym,...]})
#    v8.1 bugfix:load_a_config() 一直呼叫本函式,但定義在某次重構中遺失
#    (NameError → 任何 A.xlsx 都無法載入)。依 aconfig-xlsx.js 匯出契約補回:
#    欄名 .get 讀取(守則 #81)、缺分頁/空分頁 → {}(安全降級)、保留插入順序。
def _parse_symbol_sets(df: pd.DataFrame | None) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    if df is None or df.empty:
        return out
    for _, row in df.iterrows():
        set_name = row.get("Set_Name")
        symbol_id = row.get("Symbol_ID")
        if set_name is None or symbol_id is None:
            continue
        if pd.isna(set_name) or pd.isna(symbol_id):
            continue
        sname = str(set_name).strip()
        sid = str(symbol_id).strip()
        if not sname or not sid:
            continue
        out.setdefault(sname, [])
        if sid not in out[sname]:
            out[sname].append(sid)
    return out


def _parse_symbols(df: pd.DataFrame) -> dict[str, SymbolDef]:
    sheet = "03_Symbols"
    out = {}
    for idx, r in df.iterrows():
        sid = r.get("Symbol_ID")
        if pd.isna(sid):
            continue
        sid = str(sid).strip()
        if sid in out:
            raise ConfigValidationError(sheet, f"Symbol_ID 重複: {sid}", row=idx + 2)
        try:
            pay_table = {}
            for n in (3, 4, 5, 6):
                col = f"Pay_{n}x"
                v = r.get(col)
                if pd.notna(v):
                    pay_table[n] = float(v)
            sym = SymbolDef(
                symbol_id=sid,
                display_name=str(r.get("Display_Name") or sid),
                sym_type=SymbolType(str(r["Type"]).strip().upper()),
                pay_table=pay_table,
                mega_width=int(_col(r, "Mega_Width", "Mega_W", default=1) or 1),
                mega_height=int(_col(r, "Mega_Height", "Mega_H", default=1) or 1),
                is_wild=_to_bool(r.get("Is_Wild")),
                is_scatter=_to_bool(r.get("Is_Scatter")),
                notes=_to_str(r.get("Notes")),
                # v8.3 / R1 D-12:出現模式宣告(缺欄/空 → "" = 所有模式;安全降級)
                mode_scope=_to_str(r.get("Mode_Scope")).strip(),
                instance_mult=_to_bool(r.get("Instance_Mult")),   # v8.7 R6 D-14(缺欄 → False)
            )
            out[sid] = sym
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"Symbol {sid} 解析失敗: {e}", row=idx + 2)
    if not out:
        raise ConfigValidationError(sheet, "至少需定義 1 個符號")
    return out


def _parse_reel_weights(
    df: pd.DataFrame, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list[ReelWeight]:
    sheet = "04_Reel_Weights"
    valid_reels = {r.reel_id for r in layout.reels}
    valid_panels = {p.panel_id for p in layout.panels}
    out = []
    for idx, r in df.iterrows():
        mode_val = _col(r, "Mode", "Mode_Scope")
        if mode_val is None or pd.isna(r.get("Reel_ID")):
            continue
        try:
            mode = str(mode_val).strip()
            if mode.startswith("#"):
                continue   # 註解列
            reel_id_raw = str(r["Reel_ID"]).strip()
            # 浮點殘渣容錯:pandas 可能把數字欄讀成 "3.0"
            if re.fullmatch(r"\d+\.0", reel_id_raw):
                reel_id_raw = reel_id_raw[:-2]
            sid = str(r["Symbol_ID"]).strip()
            if sid not in symbols:
                raise ConfigValidationError(
                    sheet, f"Symbol_ID {sid} 在 03_Symbols 不存在", row=idx + 2
                )
            weight = float(r["Weight"])
            if weight < 0:
                raise ConfigValidationError(sheet, "Weight 不可為負", row=idx + 2)

            # v4.7:Reel_ID 三種定址 — 純數字=主輪、<n>.sub=副輪、其他字串=Panel ID
            is_subreel = reel_id_raw.endswith(".sub")
            numeric_part = reel_id_raw[:-4] if is_subreel else reel_id_raw
            if re.fullmatch(r"\d+", numeric_part):
                reel_id = int(numeric_part)
                if reel_id not in valid_reels:
                    raise ConfigValidationError(
                        sheet, f"Reel_ID {reel_id} 不在 02_Layout 定義範圍", row=idx + 2
                    )
                out.append(ReelWeight(
                    mode=mode, reel_id=reel_id, is_subreel=is_subreel,
                    symbol_id=sid, weight=weight,
                ))
            else:
                # panel 字串 ID
                if reel_id_raw not in valid_panels:
                    raise ConfigValidationError(
                        sheet,
                        f"Reel_ID '{reel_id_raw}' 既非主輪編號也不在 02b_Panels 定義",
                        row=idx + 2,
                    )
                out.append(ReelWeight(
                    mode=mode, reel_id=0, is_subreel=False,
                    symbol_id=sid, weight=weight, panel_id=reel_id_raw,
                ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    if not out:
        raise ConfigValidationError(sheet, "至少需 1 筆權重")
    return out


def _parse_grid_size_weights(
    df: pd.DataFrame | None, layout: LayoutConfig
) -> list[GridSizeWeight]:
    if df is None:
        return []
    sheet = "05_Grid_Size_Weights"
    valid_reels = {r.reel_id for r in layout.reels}
    layout_max = {r.reel_id: r.max_rows for r in layout.reels}
    out = []
    for idx, r in df.iterrows():
        mode_val = _col(r, "Mode", "Mode_Scope")
        if mode_val is None or pd.isna(r.get("Reel_ID")):
            continue
        try:
            mode = str(mode_val).strip()
            if mode.startswith("#"):
                continue   # 註解列
            reel_id = int(r["Reel_ID"])
            if reel_id not in valid_reels:
                raise ConfigValidationError(
                    sheet, f"Reel_ID {reel_id} 不存在", row=idx + 2
                )
            grid_size = int(r["Grid_Size"])
            if grid_size > layout_max[reel_id]:
                raise ConfigValidationError(
                    sheet,
                    f"Reel {reel_id} 的 Grid_Size {grid_size} 超過 Max_Rows {layout_max[reel_id]}",
                    row=idx + 2,
                )
            out.append(GridSizeWeight(
                mode=mode,
                reel_id=reel_id,
                grid_size=grid_size,
                weight=float(r["Weight"]),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError):
            continue   # 灰色範例列允許略過
    return out


def _parse_paylines(df: pd.DataFrame, layout: LayoutConfig) -> list[Payline]:
    sheet = "06_Paylines"
    out = []
    valid_cells = {(r.reel_id, row)
                   for r in layout.reels
                   for row in range(1, r.max_rows + 1)}

    for idx, r in df.iterrows():
        if pd.isna(r.get("Line_ID")) or pd.isna(r.get("Path")):
            continue
        try:
            line_id = int(r["Line_ID"])
            path_str = str(r["Path"]).strip()
            path = _parse_path(path_str)
            for (reel, row) in path:
                if (reel, row) not in valid_cells:
                    raise ConfigValidationError(
                        sheet,
                        f"Line {line_id} 路徑點 ({reel},{row}) 在不規則盤面上不合法",
                        row=idx + 2,
                    )
            direction = WaysDirection(_to_str(r.get("Direction"), "LTR").upper())
            out.append(Payline(
                line_id=line_id,
                path=path,
                direction=direction,
                notes=_to_str(r.get("Notes")),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)

    # ★ 前 3 格重疊偵測 ★
    #   v8.7 / R6 A-3:由硬錯誤降為 warning——官方線表常見共享前綴(同前 3 格、後段分岔),
    #   企劃照抄官方線表不應被工具擋。引擎(pay_resolver)實查不消費 prefix 唯一性。
    seen = {}
    for line in out:
        if len(line.path) < 3:
            continue
        prefix = tuple(line.path[:3])
        if prefix in seen:
            warnings.warn(
                f"[{sheet}] Payline {line.line_id} 與 {seen[prefix]} 的前 3 格路徑重疊: {prefix}"
                f"(官方線表常見;僅提醒,不阻擋載入)")
        else:
            seen[prefix] = line.line_id
    return out


def _parse_path(s: str) -> list[tuple[int, int]]:
    """'(1,1)-(2,1)-(3,1)' → [(1,1),(2,1),(3,1)]"""
    parts = s.split("-")
    out = []
    for p in parts:
        m = re.match(r"\(\s*(\d+)\s*,\s*(\d+)\s*\)", p.strip())
        if not m:
            raise ValueError(f"無效路徑片段: {p!r}")
        out.append((int(m.group(1)), int(m.group(2))))
    return out


def _parse_constraints(
    df: pd.DataFrame, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list[Constraint]:
    sheet = "07_Constraints"
    valid_reels = {r.reel_id for r in layout.reels}
    out = []
    for idx, r in df.iterrows():
        if pd.isna(r.get("Constraint_ID")):
            continue
        try:
            sid = _to_str(r.get("Symbol_ID"))
            if sid and sid.lower() != "nan" and sid not in symbols:
                raise ConfigValidationError(
                    sheet, f"Symbol_ID {sid} 不存在", row=idx + 2
                )
            reels_str = _to_str(r.get("Reels_Allowed"))
            reels_allowed = []
            if reels_str and reels_str.lower() != "nan":
                reels_allowed = [int(x.strip()) for x in reels_str.split(",") if x.strip()]
                for reel in reels_allowed:
                    if reel not in valid_reels:
                        raise ConfigValidationError(
                            sheet, f"Reel {reel} 不存在", row=idx + 2
                        )
            threshold = 0
            v = r.get("Max_Count_Global")
            if pd.notna(v):
                threshold = int(v)
            out.append(Constraint(
                constraint_id=str(r["Constraint_ID"]).strip(),
                ctype=ConstraintType(str(r["Type"]).strip().upper()),
                symbol_id=sid,
                reels_allowed=reels_allowed,
                threshold=threshold,
                mode_scope=_to_str(r.get("Mode_Scope"), "ALL"),
                notes=_to_str(r.get("Notes")),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


def _parse_gen_limits(
    df, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list:
    """v7.11:07b_Gen_Limits(產牌限制 / 生成期約束)。

    additive 契約:sheet 不存在(df is None)→ 回空 list(舊檔安全降級)。
    長格式:一條 = 一個符號 × 一個 zone × (min, max) × mode_scope。
    zone 交叉驗證:
      MAIN              恆合法
      SUB:<reel_id>     reel_id 須存在且該 reel has_subreel
      PANEL:<panel_id>  panel_id 須存在於 02b_Panels
    驗證:min<=max(兩者皆給時);min/max 至少一個 > 0(否則此條無意義 → 仍載入,前端標 warn)。
    注意:本工具不執行此約束;僅載入供下游模擬工具消費。
    """
    sheet = "07b_Gen_Limits"
    if df is None:
        return []
    valid_reels = {r.reel_id for r in layout.reels}
    sub_reels = {r.reel_id for r in layout.reels if r.has_subreel}
    valid_panels = {p.panel_id for p in layout.panels}
    out = []
    for idx, r in df.iterrows():
        if pd.isna(r.get("Limit_ID")):
            continue
        try:
            lid = _to_str(r.get("Limit_ID"))
            if not lid:
                continue
            sid = _to_str(r.get("Symbol_ID"))
            if sid and sid not in symbols:
                raise ConfigValidationError(
                    sheet, f"Symbol_ID {sid} 不存在", row=idx + 2)

            zone = _to_str(r.get("Zone"), "MAIN") or "MAIN"
            zu = zone.upper()
            if zu == "MAIN":
                zone = "MAIN"
            elif zu.startswith("SUB:"):
                rid_str = zone.split(":", 1)[1].strip()
                if not rid_str.isdigit() or int(rid_str) not in valid_reels:
                    raise ConfigValidationError(
                        sheet, f"Zone '{zone}' 指向不存在的 Reel", row=idx + 2)
                if int(rid_str) not in sub_reels:
                    raise ConfigValidationError(
                        sheet, f"Zone '{zone}' 的 Reel {rid_str} 沒有副輪", row=idx + 2)
                zone = f"SUB:{int(rid_str)}"
            elif zu.startswith("PANEL:"):
                pid = zone.split(":", 1)[1].strip()
                if pid not in valid_panels:
                    raise ConfigValidationError(
                        sheet, f"Zone '{zone}' 指向不存在的 Panel", row=idx + 2)
                zone = f"PANEL:{pid}"
            else:
                raise ConfigValidationError(
                    sheet, f"Zone '{zone}' 格式不合法(應為 MAIN / SUB:<id> / PANEL:<id>)",
                    row=idx + 2)

            vmin = r.get("Min_Count")
            min_count = int(vmin) if pd.notna(vmin) and str(vmin).strip() != "" else 0
            vmax = r.get("Max_Count")
            max_count = (int(vmax) if pd.notna(vmax) and str(vmax).strip() != ""
                         else None)
            if min_count < 0 or (max_count is not None and max_count < 0):
                raise ConfigValidationError(
                    sheet, "Min_Count / Max_Count 不可為負", row=idx + 2)
            if max_count is not None and min_count > max_count:
                raise ConfigValidationError(
                    sheet, f"Min_Count({min_count}) 不可大於 Max_Count({max_count})",
                    row=idx + 2)

            out.append(GenLimit(
                limit_id=lid,
                symbol_id=sid,
                zone=zone,
                min_count=min_count,
                max_count=max_count,
                mode_scope=_to_str(r.get("Mode_Scope"), "ALL") or "ALL",
                notes=_to_str(r.get("Notes")),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, KeyError, TypeError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


_VALID_CELL_ATTRS = ("MULT", "ENHANCER", "FRAME", "GOLD", "CUSTOM")   # v8.8 B-6


def _parse_cell_attrs(df, layout: LayoutConfig) -> list:
    """v8.8 / R4 B-6:02d_Cell_Attributes(位置型格子屬性;規格描述)。

    additive 契約:sheet 不存在 → [](安全降級)。by-name 讀。
    座標 1-based(Reel=reel_id、Row=1..max_rows 局部列),對齊 06_Paylines 慣例。
    交叉驗證:Reel 須存在;Row 須在 1..max_rows;落洞(遮罩外)→ 報錯
    (洞格語義同 ReelLayout.active_local_rows,承 v7.15 座標 lint 單一真相)。
    """
    out = []
    if df is None:
        return out
    sheet = "02d_Cell_Attributes"
    reels = {r.reel_id: r for r in layout.reels}
    for idx, r in df.iterrows():
        aid = r.get("Attr_ID")
        if pd.isna(aid) or not str(aid).strip():
            continue
        try:
            reel = int(r.get("Reel", 0) or 0)
            row = int(r.get("Row", 0) or 0)
            if reel not in reels:
                raise ConfigValidationError(
                    sheet, f"格子屬性 '{aid}' 的 Reel {reel} 不存在於 02_Layout", row=idx + 2)
            rl = reels[reel]
            if row < 1 or row > rl.max_rows:
                raise ConfigValidationError(
                    sheet, f"格子屬性 '{aid}' 的 Row {row} 超出 R{reel} 範圍(1–{rl.max_rows})",
                    row=idx + 2)
            if (row - 1) not in rl.active_local_rows():
                raise ConfigValidationError(
                    sheet, f"格子屬性 '{aid}' 的 ({reel},{row}) 落在洞格(遮罩外)", row=idx + 2)
            attr_raw = _to_str(r.get("Attr")).strip().upper()
            attr = attr_raw or "MULT"
            if attr not in _VALID_CELL_ATTRS:
                raise ConfigValidationError(
                    sheet,
                    f"格子屬性 '{aid}' 的 Attr '{attr_raw}' 非合法值({'/'.join(_VALID_CELL_ATTRS)})",
                    row=idx + 2)
            _v_raw = r.get("Value")
            if isinstance(_v_raw, float) and not pd.isna(_v_raw) and _v_raw == int(_v_raw):
                _v = str(int(_v_raw))          # Excel 數字格 2 → pandas 2.0 → 還原 '2'
            else:
                _v = _to_str(_v_raw).strip()
            out.append(CellAttr(
                attr_id=str(aid).strip(),
                reel=reel,
                row=row,
                attr=attr,
                value=_v,
                mode_scope=_to_str(r.get("Mode_Scope")).strip() or "ALL",
                notes=_to_str(r.get("Notes")),
            ))
        except ConfigValidationError:
            raise
        except (ValueError, TypeError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


def _parse_combo_weights(
    df: pd.DataFrame | None, symbols: dict[str, SymbolDef], layout: LayoutConfig
) -> list[ComboWeightOverride]:
    if df is None:
        return []
    sheet = "08_Combo_Weights"
    valid_reels = {r.reel_id for r in layout.reels}
    out = []
    for idx, r in df.iterrows():
        mode_val = _col(r, "Mode", "Mode_Scope")
        after_val = _col(r, "After_Combo", "Combo_Step")
        if mode_val is None or after_val is None:
            continue
        try:
            mode = str(mode_val).strip()
            if mode.startswith("#"):
                continue
            reel_id = int(r["Reel_ID"])
            sid = str(r["Symbol_ID"]).strip()
            if reel_id not in valid_reels:
                continue   # 範例列略過
            if sid not in symbols:
                continue
            out.append(ComboWeightOverride(
                mode=mode,
                after_combo=int(after_val),
                reel_id=reel_id,
                symbol_id=sid,
                weight=float(r["Weight"]),
            ))
        except (ValueError, KeyError):
            continue
    return out


def _parse_puzzle_rules(df: pd.DataFrame) -> list[PuzzleRule]:
    sheet = "09_Puzzle_Rules"
    out = []
    seen_priorities = defaultdict(list)
    for idx, r in df.iterrows():
        if pd.isna(r.get("Rule_ID")):
            continue
        try:
            rule_id = str(r["Rule_ID"]).strip()
            priority = int(r["Priority"])
            trigger = TriggerType(str(r["Trigger"]).strip().upper())
            cond = parse_condition(_to_str(r.get("Condition")))
            actions = parse_actions(_to_str(r.get("Actions")))
            emits_str = _to_str(r.get("Emits"))
            emits = [s.strip() for s in emits_str.split(",") if s.strip()] if emits_str else []
            enabled = _to_bool(r.get("Enabled"))
            out.append(PuzzleRule(
                rule_id=rule_id,
                priority=priority,
                trigger=trigger,
                condition=cond,
                actions=actions,
                emits=emits,
                enabled=enabled,
                description=_to_str(r.get("Description")),
                # v8.4 / R2 P5:隨機擇一組(缺欄/空 → 預設;安全降級)
                random_group=_to_str(r.get("Random_Group")).strip(),
                random_weight=float(r.get("Random_Weight")) if pd.notna(r.get("Random_Weight")) else 100.0,
            ))
            seen_priorities[(trigger, priority)].append(rule_id)
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗 ({e})", row=idx + 2)

    # 同一 Trigger 內 Priority 重複 → 警告但不阻止(允許但顯示在 log)
    # 嚴格模式可改為錯誤
    for (trig, pri), rids in seen_priorities.items():
        if len(rids) > 1:
            print(f"⚠ [09_Puzzle_Rules] Trigger={trig.value} Priority={pri} 重複: {rids}. "
                  f"執行順序將以 Rule_ID 字典序為次要排序鍵。")
    return out


def _parse_discard_rules(df: pd.DataFrame) -> list[DiscardRule]:
    sheet = "10_Discard_Rules"
    out = []
    for idx, r in df.iterrows():
        rid_val = _col(r, "Rule_ID", "Discard_ID")
        if rid_val is None:
            continue
        try:
            cond = parse_condition(_to_str(r.get("Condition")))
            dtype_val = _col(r, "Type", "Discard_Kind")
            if dtype_val is None:
                raise KeyError("Type / Discard_Kind")
            out.append(DiscardRule(
                rule_id=str(rid_val).strip(),
                dtype=DiscardType(str(dtype_val).strip().upper()),
                mode_scope=_to_str(r.get("Mode_Scope"), "ALL"),
                condition=cond,
                reason_label=_to_str(r.get("Reason_Label")),
                notes=_to_str(r.get("Notes")),
            ))
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗 ({e})", row=idx + 2)
    return out


# v7.14:合法玩法種類(SPIN=旋轉;其餘=bonus 小遊戲)
_VALID_MODE_KINDS = ("SPIN", "WHEEL", "PICK", "COLLECTION")
_VALID_RESPIN_RESET = ("NEW_SYMBOL", "ANY_WIN", "NEVER")   # v8.5:Respin_Reset_On 合法值(另可留空)
_VALID_PAY_TYPES = ("LINE", "WAYS", "SCATTER", "CLUSTER")   # v8.7 A-2:Pay_Type_Override 合法值(另可留空=繼承)


def _parse_modes(df: pd.DataFrame) -> dict[str, ModeConfig]:
    sheet = "11_Mode_Config"
    out = {}
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode")):
            continue
        try:
            mode = str(r["Mode"]).strip()
            if mode in out:
                raise ConfigValidationError(sheet, f"Mode {mode} 重複定義", row=idx + 2)
            cond = parse_condition(_to_str(r.get("Trigger_Condition")))
            reset_str = _to_str(r.get("On_Enter_Reset_Vars"))
            reset_vars = [s.strip() for s in reset_str.split(",") if s.strip()]
            # v7.10 additive:Reset_Scope(尾端新欄;缺欄/空 → None = 繼承全域)
            rs_raw = _to_str(r.get("Reset_Scope")).strip().upper()
            reset_scope = None
            if rs_raw:
                try:
                    reset_scope = ResetScope(rs_raw)
                except ValueError:
                    raise ConfigValidationError(
                        sheet, f"Reset_Scope '{rs_raw}' 非合法值(CASCADE/SPIN/FEATURE 或留空)", row=idx + 2)
            # v7.11 additive:Cap_Enabled / Cap_Value / Stack_Mode(尾端新欄;缺欄/空 → 預設)
            cap_enabled = _to_str(r.get("Cap_Enabled")).strip()
            cap_value = _to_str(r.get("Cap_Value")).strip()
            sm_raw = _to_str(r.get("Stack_Mode")).strip().upper()
            stack_mode = None
            if sm_raw:
                try:
                    stack_mode = MultStackMode(sm_raw)
                except ValueError:
                    raise ConfigValidationError(
                        sheet, f"Stack_Mode '{sm_raw}' 非合法值(MUL/ADD 或留空)", row=idx + 2)
            # v7.14 additive:Mode_Kind(尾端新欄;缺欄/空 → SPIN;非法值 → 報錯)
            #   + WHEEL/PICK/COLLECTION 的 mini-game 欄位(by-name,缺 → 預設)。
            mk_raw = _to_str(r.get("Mode_Kind")).strip().upper()
            mode_kind = mk_raw or "SPIN"
            if mode_kind not in _VALID_MODE_KINDS:
                raise ConfigValidationError(
                    sheet,
                    f"Mode_Kind '{mk_raw}' 非合法值({'/'.join(_VALID_MODE_KINDS)} 或留空)",
                    row=idx + 2)
            wheel_upgrade_to = _to_str(r.get("Wheel_Upgrade_To")).strip()
            pick_count = int(r.get("Pick_Count", 0) or 0)
            collect_target = int(r.get("Collect_Target", 0) or 0)
            # v8.5 / R3 additive:玩家擇一組 + Hold&Win respin 描述欄(by-name,缺欄 → 預設)
            choice_group = _to_str(r.get("Choice_Group")).strip()
            respin_base = int(r.get("Respin_Base", 0) or 0)
            rr_raw = _to_str(r.get("Respin_Reset_On")).strip().upper()
            if rr_raw and rr_raw not in _VALID_RESPIN_RESET:
                raise ConfigValidationError(
                    sheet,
                    f"Respin_Reset_On '{rr_raw}' 非合法值({'/'.join(_VALID_RESPIN_RESET)} 或留空)",
                    row=idx + 2)
            respin_reset_on = rr_raw
            respin_stop_cond = _to_str(r.get("Respin_Stop_Cond")).strip()
            # v8.7 / R6 A-2:per-mode 賠付模型覆寫(by-name;缺欄/空 → 繼承全域;非法值 → 報錯)
            pto_raw = _to_str(r.get("Pay_Type_Override")).strip().upper()
            if pto_raw and pto_raw not in _VALID_PAY_TYPES:
                raise ConfigValidationError(
                    sheet,
                    f"Pay_Type_Override '{pto_raw}' 非合法值({'/'.join(_VALID_PAY_TYPES)} 或留空=繼承全域)",
                    row=idx + 2)
            pay_type_override = pto_raw
            out[mode] = ModeConfig(
                mode=mode,
                trigger_condition=cond,
                spin_count=int(r.get("Spin_Count", 0) or 0),
                inherit_globals=_to_bool(r.get("Inherit_Globals")),
                on_enter_reset_vars=reset_vars,
                notes=_to_str(r.get("Notes")),
                reset_scope=reset_scope,
                cap_enabled=cap_enabled,
                cap_value=cap_value,
                stack_mode=stack_mode,
                mode_kind=mode_kind,
                wheel_upgrade_to=wheel_upgrade_to,
                pick_count=pick_count,
                collect_target=collect_target,
                choice_group=choice_group,
                respin_base=respin_base,
                respin_reset_on=respin_reset_on,
                respin_stop_cond=respin_stop_cond,
                pay_type_override=pay_type_override,
            )
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    if not out:
        raise ConfigValidationError(sheet, "至少需定義 1 個模式")
    return out


def _parse_mode_trigger_pays(df, modes: dict) -> None:
    """v7.10:11b_Mode_TriggerPays(scatter-pay 觸發給付)。

    additive 契約:sheet 不存在(df is None)→ 整段跳過,各 mode.trigger_pays 維持空。
    一個 mode 多列;依 Mode 欄分組塞回對應 ModeConfig.trigger_pays。
    引用不存在的 Mode → 報錯(交叉驗證,比照 reel_weights 的「Mode 未定義」)。
    注意:引擎目前尚未消費此欄(Stage 3 才執行);此處僅資料載入。
    """
    sheet = "11b_Mode_TriggerPays"
    if df is None:
        return
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode")):
            continue
        mode = str(r["Mode"]).strip()
        if not mode:
            continue
        if mode not in modes:
            raise ConfigValidationError(
                sheet, f"Mode '{mode}' 未在 11_Mode_Config 定義", row=idx + 2)
        try:
            modes[mode].trigger_pays.append(TriggerPay(
                scatter_count=int(r.get("Scatter_Count", 0) or 0),
                pay=float(r.get("Pay", 0) or 0),
                grants_spins=int(r.get("Grants_Spins", 0) or 0),
            ))
        except (ValueError, TypeError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)


def _parse_mode_items(df, modes: dict) -> None:
    """v7.14:11c_Mode_Items(bonus 小遊戲獎項表,long-format tidy)。

    additive 契約:sheet 不存在(df is None)→ 整段跳過,各 mode.items 維持空。
    一個 mode 多列;依 Mode 欄分組塞回對應 ModeConfig.items(沿用 BonusItem)。
    引用不存在的 Mode → 報錯(交叉驗證,比照 11b_Mode_TriggerPays)。
    注意:引擎不消費(本工具不執行、不算 RTP);此處僅資料載入供 docgen/下游工具。
    """
    sheet = "11c_Mode_Items"
    if df is None:
        return
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode")):
            continue
        mode = str(r["Mode"]).strip()
        if not mode:
            continue
        if mode not in modes:
            raise ConfigValidationError(
                sheet, f"Mode '{mode}' 未在 11_Mode_Config 定義", row=idx + 2)
        try:
            modes[mode].items.append(BonusItem(
                label=_to_str(r.get("Item_Label")),
                value=float(r.get("Item_Value", 0) or 0),
                weight=float(r.get("Item_Weight", 100) or 0),
                is_end=_to_bool(r.get("Item_Is_End")),
                link_jackpot=_to_str(r.get("Item_Link_JP")),
            ))
        except (ValueError, TypeError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)


def _parse_distribution_bins(df: pd.DataFrame) -> dict[str, DistributionBin]:
    sheet = "12_Distribution_Bins"
    out = {}
    for idx, r in df.iterrows():
        if pd.isna(r.get("Mode_Scope")) or pd.isna(r.get("Bin_Edges")):
            continue
        try:
            scope = str(r["Mode_Scope"]).strip()
            edges = _parse_csv_floats(str(r["Bin_Edges"]))
            if len(edges) < 2:
                raise ConfigValidationError(
                    sheet, f"Bin_Edges 至少 2 個邊界,目前 {len(edges)}", row=idx + 2
                )
            for i in range(len(edges) - 1):
                if edges[i] >= edges[i + 1]:
                    raise ConfigValidationError(
                        sheet,
                        f"Bin_Edges 必須嚴格遞增,違反處: {edges[i]} >= {edges[i+1]}",
                        row=idx + 2,
                    )
            out[scope] = DistributionBin(
                mode_scope=scope,
                bin_edges=edges,
                notes=_to_str(r.get("Notes")),
            )
        except ConfigValidationError:
            raise
        except (ValueError, KeyError) as e:
            raise ConfigValidationError(sheet, f"解析失敗: {e}", row=idx + 2)
    return out


# ============================================================
# 全分頁交叉驗證
# ============================================================
def _cross_validate(cfg: AConfig):
    # starting_mode 必須存在
    if cfg.global_cfg.starting_mode not in cfg.modes:
        raise ConfigValidationError(
            "01_Global",
            f"starting_mode '{cfg.global_cfg.starting_mode}' 在 11_Mode_Config 未定義",
        )

    # v7.14:starting_mode 必須是 SPIN 玩法(不能從 bonus 小遊戲開局)
    _start = cfg.modes.get(cfg.global_cfg.starting_mode)
    if _start is not None and getattr(_start, "mode_kind", "SPIN") != "SPIN":
        raise ConfigValidationError(
            "01_Global",
            f"starting_mode '{cfg.global_cfg.starting_mode}' 的 Mode_Kind 為 "
            f"'{_start.mode_kind}';開局模式必須是 SPIN",
        )

    # v8.5 / R3:starting_mode 不可屬玩家擇一組(開局模式不是被選出來的)
    if _start is not None and getattr(_start, "choice_group", "").strip():
        raise ConfigValidationError(
            "01_Global",
            f"starting_mode '{cfg.global_cfg.starting_mode}' 屬擇一組 "
            f"'{_start.choice_group}';開局模式不可設 Choice_Group",
        )

    # v7.14:WHEEL 升級鏈交叉驗證 — wheel_upgrade_to 指向的 mode 須存在且為 WHEEL
    for _m in cfg.modes.values():
        _tgt = getattr(_m, "wheel_upgrade_to", "").strip()
        if not _tgt:
            continue
        if _tgt not in cfg.modes:
            raise ConfigValidationError(
                "11_Mode_Config",
                f"Mode '{_m.mode}' 的 Wheel_Upgrade_To '{_tgt}' 未在 11_Mode_Config 定義",
            )
        if cfg.modes[_tgt].mode_kind != "WHEEL":
            raise ConfigValidationError(
                "11_Mode_Config",
                f"Mode '{_m.mode}' 的 Wheel_Upgrade_To 指向 '{_tgt}',"
                f"但其 Mode_Kind 為 '{cfg.modes[_tgt].mode_kind}'(升級目標必須是 WHEEL)",
            )

    # 所有 Reel_Weights 引用的 Mode 必須存在
    for w in cfg.reel_weights:
        if w.mode not in cfg.modes:
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode '{w.mode}' 未在 11_Mode_Config 定義",
            )

    # 每個 Mode × Reel 至少要有一筆權重 (若該 Mode 在 Reel_Weights 出現)
    # v4.7:panel 權重(panel_id 非空)另行分組,不混入主輪/副輪檢查
    weight_groups = defaultdict(list)
    panel_weight_groups = defaultdict(list)
    for w in cfg.reel_weights:
        if getattr(w, "panel_id", ""):
            panel_weight_groups[(w.mode, w.panel_id)].append(w)
        else:
            weight_groups[(w.mode, w.reel_id, w.is_subreel)].append(w)
    for (mode, reel_id, is_sub), ws in weight_groups.items():
        total = sum(w.weight for w in ws)
        if total <= 0:
            tag = ".sub" if is_sub else ""
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode={mode} Reel={reel_id}{tag} 的權重總和必須 > 0",
            )
    for (mode, pid), ws in panel_weight_groups.items():
        if sum(w.weight for w in ws) <= 0:
            raise ConfigValidationError(
                "04_Reel_Weights",
                f"Mode={mode} Panel={pid} 的權重總和必須 > 0",
            )

    # v5.1:附掛副盤符號集交叉驗證(同 panel 的 symbol_set 規則)
    for reel in cfg.layout.reels:
        sset = getattr(reel, "subreel_symbol_set", "")
        if reel.has_subreel and sset:
            members = cfg.symbol_sets.get(sset)
            if not members:
                raise ConfigValidationError(
                    "02_Layout",
                    f"Reel {reel.reel_id} 副盤引用的符號集 '{sset}' "
                    f"未在 03b_Symbol_Sets 定義或為空",
                )

    # v5.4:15_Multipliers — 隨機倍數承載符號必須存在
    mp = cfg.multipliers
    if mp and mp.random_enabled and mp.random_symbol_id:
        if mp.random_symbol_id not in cfg.symbols:
            raise ConfigValidationError(
                "15_Multipliers",
                f"隨機倍數承載符號 '{mp.random_symbol_id}' 未在 03_Symbols 定義",
            )

    # v5.4:16_Coin_Values — 金幣符號存在 + link_jackpot 引用合法
    cv = cfg.coin_values
    if cv and cv.enabled:
        if cv.coin_symbol_id and cv.coin_symbol_id not in cfg.symbols:
            raise ConfigValidationError(
                "16_Coin_Values",
                f"金幣符號 '{cv.coin_symbol_id}' 未在 03_Symbols 定義",
            )
        # 13_Jackpots 的 jp_id 集合（raw_dataframes 可能含；否則略過 JP 連結檢查）
        jp_ids = set()
        jp_df = cfg.raw_dataframes.get("13_Jackpots") if cfg.raw_dataframes else None
        if jp_df is not None:
            try:
                jp_ids = {str(x).strip() for x in jp_df.get("JP_ID", []) if str(x).strip()}
            except Exception:
                jp_ids = set()
        for d in cv.denominations:
            if d.link_jackpot and jp_ids and d.link_jackpot not in jp_ids:
                raise ConfigValidationError(
                    "16_Coin_Values",
                    f"面額 '{d.label or d.value}' 連結的 JP '{d.link_jackpot}' 不存在於 13_Jackpots",
                )

    # v4.7:panel 交叉驗證
    panels_with_weights = {pid for (_, pid) in panel_weight_groups}
    for p in cfg.layout.panels:
        # symbol_set 引用必須存在且非空
        if p.symbol_set:
            members = cfg.symbol_sets.get(p.symbol_set)
            if not members:
                raise ConfigValidationError(
                    "02b_Panels",
                    f"Panel {p.panel_id} 引用的符號集 '{p.symbol_set}' "
                    f"未在 03b_Symbol_Sets 定義或為空",
                )
        # 完全沒有權重來源(無專屬池、無符號集、不沿用) → 模擬會整片空白,提早警告
        if (p.panel_id not in panels_with_weights
                and not p.symbol_set and not p.inherit_weight):
            print(f"⚠ [02b_Panels] Panel {p.panel_id} 沒有任何權重來源"
                  f"(04 無專屬權重、無符號集、未沿用保底),模擬時此副盤會是空白。")

    # AWARD_FREE_SPIN(mode=X) 引用的 X 必須在 Mode_Config 存在
    for rule in cfg.puzzle_rules:
        for act in rule.actions:
            if act.atype.value == "AWARD_FREE_SPIN":
                target = act.params.get("mode")
                if target and target not in cfg.modes:
                    raise ConfigValidationError(
                        "09_Puzzle_Rules",
                        f"Rule {rule.rule_id} 的 AWARD_FREE_SPIN 引用未知模式 '{target}'",
                    )
            if act.atype.value == "SWITCH_MODE":
                target = act.params.get("target")
                if target and target not in cfg.modes:
                    raise ConfigValidationError(
                        "09_Puzzle_Rules",
                        f"Rule {rule.rule_id} 的 SWITCH_MODE 引用未知模式 '{target}'",
                    )

    # Discard 規則的 mode_scope 必須存在或為 ALL
    for d in cfg.discard_rules:
        if d.mode_scope != "ALL" and d.mode_scope not in cfg.modes:
            raise ConfigValidationError(
                "10_Discard_Rules",
                f"Rule {d.rule_id} 的 Mode_Scope '{d.mode_scope}' 未定義",
            )


# ============================================================
# 工具函式
# ============================================================
def _to_bool(v: Any) -> bool:
    if v is None or pd.isna(v):
        return False
    if isinstance(v, bool):
        return v
    s = str(v).strip().upper()
    return s in ("TRUE", "1", "YES", "Y", "T")


def _to_str(v: Any, default: str = "") -> str:
    """安全字串轉換:處理 NaN / None / 空白"""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return default
    s = str(v).strip()
    if s.lower() == "nan":
        return default
    return s


def _parse_csv_floats(s: Any) -> list[float]:
    if s is None or pd.isna(s):
        return []
    parts = str(s).split(",")
    return [float(x.strip()) for x in parts if x.strip()]


def _parse_csv_ints(s: Any) -> list[int]:
    if s is None or pd.isna(s):
        return []
    parts = str(s).split(",")
    return [int(float(x.strip())) for x in parts if x.strip()]
