"""
腳本引擎 (LogicParser) — 原子化「拼拼樂」事件解析器  S3 完整版

執行流程:
  1. 由 Combo/Spin 主迴圈呼叫 dispatch(trigger, ctx)
  2. 篩出對應 trigger 的規則,按 priority 排序
  3. 每條規則評估 condition,通過則執行 actions
  4. EMIT_EVENT 寫入 ctx.pending_emits 佇列
  5. drain_emits 階段把 emit 佇列轉為 ON_CUSTOM_EMIT 觸發,遞迴處理
  6. 直到佇列清空,或達 MAX_CHAIN_DEPTH (拋 PuzzleLoopError)

S3 新增：
  - BOARD_FILL / BOARD_TRANSFORM / BOARD_DESTROY / MOVE / SWAP / STICKY / LOCK_REEL
    全部改為真實實作（委派給 ctx.grid.apply_action）
  - ctx.grid 是 GridEngine 實例，在 engine.spin() 中被設定
"""
from __future__ import annotations
from dataclasses import dataclass, field
from collections import deque, Counter, defaultdict
from typing import Any, Callable, Optional

from .schemas import (
    PuzzleRule, Condition, ConditionLeaf, ConditionNode, ConditionOp,
    Action, ActionType, TriggerType, PuzzleLoopError,
)


# ============================================================
# 評估上下文
# ============================================================
@dataclass
class EvalContext:
    grid: Any = None
    spin_locals: dict = field(default_factory=dict)
    globals_ref: dict = field(default_factory=dict)
    multiplier: float = 1.0
    combo_step: int = 0
    mode: str = "NG"
    win_events: list = field(default_factory=list)
    pending_emits: deque = field(default_factory=deque)
    consecutive_dead_spins: int = 0
    total_multiplier: float = 0.0
    symbol_count: dict[str, int] = field(default_factory=dict)
    last_emit_event: Optional[str] = None
    last_emit_payload: dict = field(default_factory=dict)


# ============================================================
# 條件評估
# ============================================================
def evaluate_condition(cond: Optional[Condition], ctx: EvalContext) -> bool:
    if cond is None:
        return True
    if isinstance(cond, ConditionLeaf):
        return _eval_leaf(cond, ctx)
    if cond.op == ConditionOp.AND:
        return all(evaluate_condition(c, ctx) for c in cond.children)
    if cond.op == ConditionOp.OR:
        return any(evaluate_condition(c, ctx) for c in cond.children)
    if cond.op == ConditionOp.NOT:
        return not evaluate_condition(cond.children[0], ctx)
    raise ValueError(f"未支援的條件節點 op: {cond.op}")


def _eval_leaf(leaf: ConditionLeaf, ctx: EvalContext) -> bool:
    actual = _resolve_var(leaf.var, ctx)
    expected = leaf.value
    op = leaf.op
    try:
        if op == ConditionOp.EQ:      return actual == expected
        if op == ConditionOp.NE:      return actual != expected
        if op == ConditionOp.GT:      return actual > expected
        if op == ConditionOp.GTE:     return actual >= expected
        if op == ConditionOp.LT:      return actual < expected
        if op == ConditionOp.LTE:     return actual <= expected
        if op == ConditionOp.IN:
            return actual in (expected if isinstance(expected, (list, tuple, set)) else [expected])
        if op == ConditionOp.NOT_IN:
            return actual not in (expected if isinstance(expected, (list, tuple, set)) else [expected])
        if op == ConditionOp.CONTAINS:
            return expected in (actual or [])
    except TypeError:
        return False
    return False


def _resolve_var(var: str, ctx: EvalContext) -> Any:
    if var == "combo_step":              return ctx.combo_step
    if var == "mode":                    return ctx.mode
    if var == "multiplier":              return ctx.multiplier
    if var == "total_multiplier":        return ctx.total_multiplier
    if var == "consecutive_dead_spins":  return ctx.consecutive_dead_spins
    if var == "event":                   return ctx.last_emit_event or ""
    if var.startswith("symbol_count."):
        return ctx.symbol_count.get(var.split(".", 1)[1], 0)
    if var.startswith("global."):
        return ctx.globals_ref.get(var.split(".", 1)[1], 0)
    if var.startswith("spin."):
        return ctx.spin_locals.get(var.split(".", 1)[1], 0)
    if var.startswith("payload."):
        return ctx.last_emit_payload.get(var.split(".", 1)[1], None)
    return ctx.spin_locals.get(var, None)


# ============================================================
# Action 執行結果
# ============================================================
@dataclass
class ActionResult:
    rule_id: str
    action_type: ActionType
    delta_mult: float = 0.0
    side_effects: list = field(default_factory=list)


# ============================================================
# Action 註冊表
# ============================================================
ACTION_REGISTRY: dict[ActionType, Callable[..., ActionResult]] = {}


def register_action(atype: ActionType):
    def deco(fn: Callable):
        ACTION_REGISTRY[atype] = fn
        return fn
    return deco


# ── 非 grid action ──

@register_action(ActionType.ADJUST_MULTIPLIER)
def _adjust_multiplier(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    op  = action.params.get("op", "add")
    val = float(action.params.get("value", 0))
    before = ctx.multiplier
    if op == "add":   ctx.multiplier += val
    elif op == "mul": ctx.multiplier *= val
    elif op == "set": ctx.multiplier  = val
    else: raise ValueError(f"ADJUST_MULTIPLIER 不支援 op={op}")
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype,
                        delta_mult=ctx.multiplier - before)


@register_action(ActionType.UPDATE_GLOBAL)
def _update_global(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    var = action.params["var"];  op = action.params.get("op", "add")
    val = action.params.get("value", 0);  cur = ctx.globals_ref.get(var, 0)
    if op == "add":  ctx.globals_ref[var] = cur + val
    elif op == "sub": ctx.globals_ref[var] = cur - val
    elif op == "mul": ctx.globals_ref[var] = cur * val
    elif op == "set": ctx.globals_ref[var] = val
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype)


@register_action(ActionType.UPDATE_LOCAL)
def _update_local(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    var = action.params["var"];  op = action.params.get("op", "add")
    val = action.params.get("value", 0);  cur = ctx.spin_locals.get(var, 0)
    if op == "add":  ctx.spin_locals[var] = cur + val
    elif op == "sub": ctx.spin_locals[var] = cur - val
    elif op == "mul": ctx.spin_locals[var] = cur * val
    elif op == "set": ctx.spin_locals[var] = val
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype)


@register_action(ActionType.EMIT_EVENT)
def _emit_event(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    name = action.params.get("name", "")
    payload = action.params.get("payload", {}) or {}
    ctx.pending_emits.append((name, payload))
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype,
                        side_effects=[("emit", name, payload)])


@register_action(ActionType.AWARD_FREE_SPIN)
def _award_free_spin(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    count  = int(action.params.get("count", 0))
    target = action.params.get("mode", "")
    ctx.spin_locals.setdefault("_pending_free_spins", []).append(
        {"mode": target, "count": count}
    )
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype,
                        side_effects=[("award_fs", target, count)])


@register_action(ActionType.SWITCH_MODE)
def _switch_mode(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    target  = action.params.get("target", "")
    inherit = action.params.get("inherit_globals", False)
    ctx.spin_locals["_pending_mode_switch"] = {"target": target, "inherit": bool(inherit)}
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype)


@register_action(ActionType.HALT_RESOLUTION)
def _halt(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    ctx.spin_locals["_halt"] = True
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype)


# ── Grid actions — S3 真實實作：委派給 ctx.grid (GridEngine) ──

def _dispatch_to_grid(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    """
    通用 grid action 委派。
    ctx.grid 在 GridEngine.spin() 中被設為 engine 實例自身；
    GridEngine.apply_action() 已實作所有 grid 操作。
    """
    if ctx.grid is not None and hasattr(ctx.grid, "apply_action"):
        ctx.grid.apply_action(action, ctx)
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype)


@register_action(ActionType.BOARD_FILL)
def _board_fill(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    """
    BOARD_FILL：用指定符號填滿盤面（或指定位置）。
    params:
      symbol_id  str           要填入的符號
      positions  [[r,row],…]  (可選) 指定填入位置；省略則填所有 destroyed 格
    委派給 GridEngine.apply_action
    """
    return _dispatch_to_grid(action, ctx, rule)


@register_action(ActionType.BOARD_TRANSFORM)
def _board_transform(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    return _dispatch_to_grid(action, ctx, rule)


@register_action(ActionType.BOARD_DESTROY)
def _board_destroy(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    return _dispatch_to_grid(action, ctx, rule)


@register_action(ActionType.MOVE)
def _move(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    """
    MOVE：把符號從一格移動到另一格（原格變空/destroyed）。
    params:
      from  [reel, row]
      to    [reel, row]
    """
    if ctx.grid is not None and hasattr(ctx.grid, "apply_action"):
        ctx.grid.apply_action(action, ctx)
    else:
        # 直接操作 _grid_cells（保底路徑）
        grid = ctx.spin_locals.get("_grid_cells", {})
        from_pos = action.params.get("from")
        to_pos   = action.params.get("to")
        if from_pos and to_pos:
            key_f = (int(from_pos[0]), int(from_pos[1]))
            key_t = (int(to_pos[0]),   int(to_pos[1]))
            if key_f in grid and key_t in grid:
                grid[key_t].symbol   = grid[key_f].symbol
                grid[key_f].destroyed = True
    return ActionResult(rule_id=rule.rule_id, action_type=action.atype)


@register_action(ActionType.SWAP)
def _swap(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    return _dispatch_to_grid(action, ctx, rule)


@register_action(ActionType.STICKY)
def _sticky(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    return _dispatch_to_grid(action, ctx, rule)


@register_action(ActionType.LOCK_REEL)
def _lock_reel(action: Action, ctx: EvalContext, rule: PuzzleRule) -> ActionResult:
    return _dispatch_to_grid(action, ctx, rule)


# ============================================================
# 主解析器
# ============================================================
class LogicParser:
    """
    腳本引擎主類別 — 規則排序、條件評估、Action 派發、死循環偵測
    """

    def __init__(
        self,
        rules: list[PuzzleRule],
        max_chain_depth: int = 100,
        max_chain_per_rule: int = 50,
    ):
        self.rules = rules
        self.max_chain_depth   = max_chain_depth
        self.max_chain_per_rule = max_chain_per_rule
        self._rules_by_trigger: dict[TriggerType, list[PuzzleRule]] = defaultdict(list)
        self._build_index(rules)
        self._chain_depth = 0
        self._fingerprint_history: Counter = Counter()

    def _build_index(self, rules: list[PuzzleRule]):
        for rule in rules:
            self._rules_by_trigger[rule.trigger].append(rule)
        for trig in self._rules_by_trigger:
            self._rules_by_trigger[trig].sort(key=lambda r: (r.priority, r.rule_id))

    def reset_chain(self):
        self._chain_depth = 0
        self._fingerprint_history.clear()

    def dispatch(self, trigger: TriggerType, ctx: EvalContext) -> list[ActionResult]:
        results: list[ActionResult] = []
        for rule in self._rules_by_trigger.get(trigger, []):
            if not rule.enabled:
                continue
            if evaluate_condition(rule.condition, ctx):
                results.extend(self._execute_rule(rule, ctx))
                rule.trigger_count += 1
                if ctx.spin_locals.get("_halt"):
                    return results
        self._drain_emits(ctx, results)
        return results

    def _execute_rule(self, rule: PuzzleRule, ctx: EvalContext) -> list[ActionResult]:
        out = []
        for action in rule.actions:
            fingerprint = (rule.rule_id, action.atype, _stable_repr(action.params))
            self._fingerprint_history[fingerprint] += 1
            if self._fingerprint_history[fingerprint] > self.max_chain_per_rule:
                raise PuzzleLoopError(
                    f"規則 {rule.rule_id} 的 action {action.atype.value} "
                    f"重複觸發超過 {self.max_chain_per_rule} 次，疑似死循環"
                )
            executor = ACTION_REGISTRY.get(action.atype)
            if executor is None:
                raise ValueError(f"未註冊的 ActionType: {action.atype}")
            result = executor(action, ctx, rule)
            out.append(result)
            if result.delta_mult:
                rule.rtp_contribution += result.delta_mult
        return out

    def _drain_emits(self, ctx: EvalContext, out: list[ActionResult]):
        while ctx.pending_emits:
            self._chain_depth += 1
            if self._chain_depth > self.max_chain_depth:
                raise PuzzleLoopError(
                    f"連鎖深度超過 {self.max_chain_depth}，疑似死循環。"
                    f"最高頻指紋 (前 5): {self._fingerprint_history.most_common(5)}"
                )
            event_name, payload = ctx.pending_emits.popleft()
            ctx.last_emit_event   = event_name
            ctx.last_emit_payload = payload if isinstance(payload, dict) else {}
            for rule in self._rules_by_trigger.get(TriggerType.ON_CUSTOM_EMIT, []):
                if not rule.enabled:
                    continue
                if evaluate_condition(rule.condition, ctx):
                    out.extend(self._execute_rule(rule, ctx))
                    rule.trigger_count += 1


def _stable_repr(d: dict) -> str:
    return repr(sorted(d.items())) if isinstance(d, dict) else repr(d)
