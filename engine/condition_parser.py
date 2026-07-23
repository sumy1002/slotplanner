"""
條件字串 → ConditionNode/ConditionLeaf 樹狀結構解析器

支援語法:
  - 變數: combo_step, mode, total_multiplier, symbol_count.WILD,
          global.coin_pool, consecutive_dead_spins, event, payload.<KEY>
  - 比較運算: ==  !=  >  >=  <  <=  in  not_in  contains
  - 邏輯運算: AND  OR  NOT  ( )
  - 字面量: 數字 (1, 2.5)、字串 (含引號或不含均可,如 FG1 或 "FG1")
            、清單 (用方括號或逗號:[1,2,3])

範例:
  "combo_step >= 3 AND mode == FG1"
  "(mode == FG1 OR mode == FG2) AND symbol_count.WILD >= 2"
  "NOT (total_multiplier > 1000) AND consecutive_dead_spins >= 3"
"""
from __future__ import annotations
import re
from .schemas import Condition, ConditionLeaf, ConditionNode, ConditionOp


# ============================================================
# Tokenizer
# ============================================================
class TokenType:
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    LBRACKET = "LBRACKET"
    RBRACKET = "RBRACKET"
    AND = "AND"
    OR = "OR"
    NOT = "NOT"
    OP = "OP"           # ==, !=, >, >=, <, <=, in, not_in, contains
    ARITH = "ARITH"     # v8.31 / E-1:算術運算子(* / + -;僅允許出現在比較的右側值)
    IDENT = "IDENT"     # 變數名 (含點: symbol_count.WILD)
    NUMBER = "NUMBER"
    STRING = "STRING"
    COMMA = "COMMA"
    EOF = "EOF"


# Tokenizer regex (順序重要,多字元 op 必須先匹配)
_TOKEN_PATTERNS = [
    (r"\s+",                    None),               # whitespace
    (r"\(",                     TokenType.LPAREN),
    (r"\)",                     TokenType.RPAREN),
    (r"\[",                     TokenType.LBRACKET),
    (r"\]",                     TokenType.RBRACKET),
    (r",",                      TokenType.COMMA),
    (r"==",                     TokenType.OP),
    (r"!=",                     TokenType.OP),
    (r">=",                     TokenType.OP),
    (r"<=",                     TokenType.OP),
    (r">",                      TokenType.OP),
    (r"<",                      TokenType.OP),
    # v8.31 / W-4:關鍵字大小寫寬容(and/or/not/in/not_in/contains 任意大小寫皆合法;
    #   前端「原始模式」手打小寫先前 JS 綠燈、Python 紅燈的不對稱在此收斂)。
    #   NOT 排在 not_in 前安全:「not_in」的 t 與 _ 皆 word char,\b 不成立 → NOT 不誤吃。
    (r"(?i:\bAND\b)",           TokenType.AND),
    (r"(?i:\bOR\b)",            TokenType.OR),
    (r"(?i:\bNOT\b)",           TokenType.NOT),
    (r"(?i:\bnot_in\b)",        TokenType.OP),
    (r"(?i:\bin\b)",            TokenType.OP),
    (r"(?i:\bcontains\b)",      TokenType.OP),
    (r"-?\d+\.\d+",             TokenType.NUMBER),
    (r"-?\d+",                  TokenType.NUMBER),
    # v8.31 / E-1:算術運算子。「-」必須排在數字 pattern 之後,負數字面(-1)優先成立;
    #   有空白的二元減(a - 1)落到此處。* / + 先前為非法字元,此為純放寬。
    (r"\*",                     TokenType.ARITH),
    (r"/",                      TokenType.ARITH),
    (r"\+",                     TokenType.ARITH),
    (r"-",                      TokenType.ARITH),
    (r"\"([^\"]*)\"",           TokenType.STRING),
    (r"'([^']*)'",              TokenType.STRING),
    # v8.29 / C-2:cell_value 座標識別字(cell_value.3,2)。窄規則:僅放行
    #   「cell_value.」前綴 + 「數字,數字」座標,不影響 list 逗號([FG1, FG2] 的
    #   逗號在 LBRACKET 深度內另行 token 化)。必須排在通用 IDENT 之前,
    #   否則通用 IDENT 會先吃到 cell_value.3 而在逗號處斷開。
    # v8.52 / P:可選 panel-id 前綴段(cell_value.BINGO.3,2 = 副盤 BINGO 該格值)。
    #   首段以字母/底線起頭 → panel_id;以數字起頭 → 主盤(cell_value.3,2,舊式不變)。
    (r"\bcell_value\.(?:[A-Za-z_]\w*\.)?\d+,\d+",  TokenType.IDENT),
    (r"[A-Za-z_][A-Za-z0-9_\.]*", TokenType.IDENT),
]


def tokenize(text: str) -> list[tuple]:
    tokens = []
    i = 0
    while i < len(text):
        matched = False
        for pattern, ttype in _TOKEN_PATTERNS:
            m = re.match(pattern, text[i:])
            if m:
                if ttype is not None:
                    tokens.append((ttype, m.group(0)))
                i += m.end()
                matched = True
                break
        if not matched:
            raise ValueError(f"無法解析的字元 '{text[i]}' 在位置 {i}: {text[max(0, i-10):i+10]}")
    tokens.append((TokenType.EOF, ""))
    return tokens


# ============================================================
# Parser (Recursive Descent)
#
# Grammar:
#   expr      := or_expr
#   or_expr   := and_expr ( OR and_expr )*
#   and_expr  := not_expr ( AND not_expr )*
#   not_expr  := NOT not_expr | atom
#   atom      := "(" expr ")" | comparison
#   comparison:= IDENT OP value
#   value     := NUMBER | STRING | IDENT | "[" value_list "]"
# ============================================================
class _Parser:
    def __init__(self, tokens: list[tuple]):
        self.tokens = tokens
        self.pos = 0

    def _peek(self) -> tuple:
        return self.tokens[self.pos]

    def _advance(self) -> tuple:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def _expect(self, ttype: str, msg: str = "") -> tuple:
        t = self._advance()
        if t[0] != ttype:
            raise ValueError(f"預期 {ttype} 但遇到 {t[0]}={t[1]!r}. {msg}")
        return t

    def parse(self) -> Condition:
        result = self._or_expr()
        if self._peek()[0] != TokenType.EOF:
            raise ValueError(f"條件字串解析未完整,殘留 token: {self._peek()}")
        return result

    def _or_expr(self) -> Condition:
        left = self._and_expr()
        while self._peek()[0] == TokenType.OR:
            self._advance()
            right = self._and_expr()
            left = ConditionNode(op=ConditionOp.OR, children=[left, right])
        return left

    def _and_expr(self) -> Condition:
        left = self._not_expr()
        while self._peek()[0] == TokenType.AND:
            self._advance()
            right = self._not_expr()
            left = ConditionNode(op=ConditionOp.AND, children=[left, right])
        return left

    def _not_expr(self) -> Condition:
        if self._peek()[0] == TokenType.NOT:
            self._advance()
            inner = self._not_expr()
            return ConditionNode(op=ConditionOp.NOT, children=[inner])
        return self._atom()

    def _atom(self) -> Condition:
        if self._peek()[0] == TokenType.LPAREN:
            self._advance()
            inner = self._or_expr()
            self._expect(TokenType.RPAREN, "缺少右括號")
            return inner
        return self._comparison()

    def _comparison(self) -> ConditionLeaf:
        ident = self._expect(TokenType.IDENT, "預期變數名")
        op_tok = self._advance()
        if op_tok[0] != TokenType.OP:
            raise ValueError(f"預期比較運算子,得到 {op_tok}")
        op = self._parse_op(op_tok[1])
        value = self._parse_value()
        return ConditionLeaf(var=ident[1], op=op, value=value)

    def _parse_value(self):
        # v8.31 / E-1:右側值允許算術式(如 global.coin_pool * 0.5)。
        #   工具定位=純描述不執行:遇算術即把整段以「原樣字串」保留在 leaf.value,
        #   求值語意交下游模擬工具。僅右側值支援;左側仍須為單一變數。
        #   list([...])內元素同規則遞迴適用。
        first_val, first_lex = self._parse_primary()
        if self._peek()[0] != TokenType.ARITH:
            return first_val
        parts = [first_lex]
        while self._peek()[0] == TokenType.ARITH:
            parts.append(self._advance()[1])          # 運算子
            _, lex = self._parse_primary()            # 下一個運算元(原樣字彙)
            parts.append(lex)
        return " ".join(parts)

    def _parse_primary(self):
        """單一值 → (python 值, 原樣字彙)。list 不參與算術,直接回傳。"""
        t = self._advance()
        if t[0] == TokenType.NUMBER:
            v = float(t[1]) if "." in t[1] else int(t[1])
            return v, t[1]
        if t[0] == TokenType.STRING:
            return t[1].strip("\"'"), t[1]
        if t[0] == TokenType.IDENT:
            # 裸字當字串(e.g. mode == FG1)
            # 也允許 TRUE/FALSE 解析為 bool
            up = t[1].upper()
            if up == "TRUE":
                return True, t[1]
            if up == "FALSE":
                return False, t[1]
            return t[1], t[1]
        if t[0] == TokenType.LBRACKET:
            items = []
            if self._peek()[0] != TokenType.RBRACKET:
                items.append(self._parse_value())
                while self._peek()[0] == TokenType.COMMA:
                    self._advance()
                    items.append(self._parse_value())
            self._expect(TokenType.RBRACKET, "缺少右方括號")
            return items, ""   # list 不參與算術(字彙不回填)
        raise ValueError(f"預期值,得到 {t}")

    def _parse_op(self, s: str) -> ConditionOp:
        mapping = {
            "==": ConditionOp.EQ, "!=": ConditionOp.NE,
            ">":  ConditionOp.GT, ">=": ConditionOp.GTE,
            "<":  ConditionOp.LT, "<=": ConditionOp.LTE,
            "in": ConditionOp.IN, "not_in": ConditionOp.NOT_IN,
            "contains": ConditionOp.CONTAINS,
        }
        if s not in mapping:
            # v8.31 / W-4:字詞運算子(in/not_in/contains)大小寫寬容 — tokenizer 已放行
            #   任意大小寫,此處以小寫正規化查表;符號運算子(== 等)不受影響。
            s_low = s.lower()
            if s_low in mapping:
                return mapping[s_low]
            raise ValueError(f"未知比較運算子: {s}")
        return mapping[s]


# ============================================================
# 公開 API
# ============================================================
def parse_condition(text: str) -> Condition:
    """將條件字串解析為 Condition 樹。空字串/None 回傳 None(視為無條件)。"""
    if text is None:
        return None
    text = text.strip()
    if not text:
        return None
    tokens = tokenize(text)
    return _Parser(tokens).parse()


def parse_actions(text: str) -> list:
    """
    解析多個 Action,以 ';' 分隔。
    每個 Action 格式: ACTION_TYPE(key1=val1, key2=val2, ...)

    範例:
      "ADJUST_MULTIPLIER(op=add, value=1); BOARD_FILL(symbol=WILD, count=2, pos=random)"
    """
    from .schemas import Action, ActionType

    if text is None or not text.strip():
        return []

    actions = []
    # 用括號平衡分割,避免 EMIT_EVENT(payload={count:1}); 這種錯切
    chunks = _split_actions(text)
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r"^([A-Z_]+)\s*\((.*)\)\s*$", chunk, re.DOTALL)
        if not m:
            raise ValueError(f"無效的 Action 語法: {chunk!r}")
        atype_str, params_str = m.group(1), m.group(2)
        try:
            atype = ActionType[atype_str]
        except KeyError:
            raise ValueError(f"未知 ActionType: {atype_str}")
        params = _parse_params(params_str)
        actions.append(Action(atype=atype, params=params))
    return actions


def _split_actions(text: str) -> list[str]:
    """以分號切割,但忽略括號/大括號/引號內的分號

    v8.29 / C-1:補引號感知(對齊前端 helpers.splitTopLevel 的 inStr 語意)。
    修復前 SPAWN(cell="2,3") 會在引號內的逗號/分號處錯切 → 靜默毀損。
    """
    chunks = []
    depth = 0
    in_str = None   # 目前所在的引號字元(" 或 '),None = 不在字串內
    current = []
    for ch in text:
        if in_str:
            current.append(ch)
            if ch == in_str:
                in_str = None
            continue
        if ch in "\"'":
            in_str = ch
            current.append(ch)
        elif ch in "({[":
            depth += 1
            current.append(ch)
        elif ch in ")}]":
            depth -= 1
            current.append(ch)
        elif ch == ";" and depth == 0:
            chunks.append("".join(current))
            current = []
        else:
            current.append(ch)
    if current:
        chunks.append("".join(current))
    return chunks


def _parse_params(s: str) -> dict:
    """解析 'key1=val1, key2=val2, payload={a:1,b:2}' 格式為 dict"""
    s = s.strip()
    if not s:
        return {}
    out = {}
    pairs = _split_top_level(s, ",")
    for pair in pairs:
        pair = pair.strip()
        if not pair:
            continue   # 尾隨逗號等空片段 → 靜默略過(既有行為)
        if "=" not in pair:
            # v8.31 / W-5:非空片段缺 '=' 改為可見失敗(先前 continue 靜默吞掉,
            #   裸座標 cell=2,3 會丟失懸空的「3」而無任何警告 → 資料靜默毀損)。
            raise ValueError(
                f"Action 參數片段缺 '=': {pair!r}"
                f"(含逗號的值請加引號,如 cell=\"2,3\")"
            )
        k, v = pair.split("=", 1)
        out[k.strip()] = _parse_value(v.strip())
    return out


def _split_top_level(s: str, sep: str) -> list[str]:
    """以 sep 切割,但忽略括號/大括號/引號內的分隔符

    v8.29 / C-1:補引號感知(對齊前端 helpers.splitTopLevel 的 inStr 語意)。
    修復前 cell="2,3" 會在引號內的逗號處錯切 → params 靜默毀損。
    """
    chunks = []
    depth = 0
    in_str = None   # 目前所在的引號字元(" 或 '),None = 不在字串內
    current = []
    for ch in s:
        if in_str:
            current.append(ch)
            if ch == in_str:
                in_str = None
            continue
        if ch in "\"'":
            in_str = ch
            current.append(ch)
        elif ch in "({[":
            depth += 1
            current.append(ch)
        elif ch in ")}]":
            depth -= 1
            current.append(ch)
        elif ch == sep and depth == 0:
            chunks.append("".join(current))
            current = []
        else:
            current.append(ch)
    if current:
        chunks.append("".join(current))
    return chunks


def _parse_value(s: str):
    s = s.strip()
    if not s:
        return ""
    # 字典 {a:1, b:2}
    if s.startswith("{") and s.endswith("}"):
        inner = s[1:-1].strip()
        if not inner:
            return {}
        out = {}
        for pair in _split_top_level(inner, ","):
            if ":" in pair:
                k, v = pair.split(":", 1)
                out[k.strip()] = _parse_value(v.strip())
        return out
    # 範圍 1-5
    m = re.match(r"^(-?\d+)-(-?\d+)$", s)
    if m:
        return {"_range": [int(m.group(1)), int(m.group(2))]}
    # 數字
    if re.match(r"^-?\d+$", s):
        return int(s)
    if re.match(r"^-?\d+\.\d+$", s):
        return float(s)
    # bool
    if s.upper() == "TRUE":
        return True
    if s.upper() == "FALSE":
        return False
    # 引號字串
    if (s.startswith("\"") and s.endswith("\"")) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1]
    # 逗號分隔清單(reels:1,2,3 這種)
    if ":" in s and not re.search(r"[(){}\[\]]", s):
        # 形如 reels:1,2,3 → {"reels": [1,2,3]}
        # 但只在 value 端遇到時才處理(此函式只處理單一 value,不處理鍵)
        pass
    # 裸字當字串
    return s
