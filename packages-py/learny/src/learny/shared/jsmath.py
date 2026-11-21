"""JavaScript numeric rendering (00-conventions section 7).

Python and JavaScript format numbers differently: `1.0` is `"1"` in JavaScript, `1e-7` is
`"1e-7"` (no leading zero in the exponent) and `Math.round` rounds halves towards +infinity.
Every rendering the Python backend produces for a user or for the contract goes through these
helpers so that byte-identical JSON is preserved (ADR-2008).
"""

import math
from decimal import ROUND_HALF_UP, Decimal, localcontext

_MAX_SAFE_EXPONENT = 1e21


def js_number(value: float | int) -> str:
    """Renders a number exactly like `JSON.stringify`/`Number#toString`."""
    if isinstance(value, bool):
        raise TypeError("a boolean is not a number")
    if isinstance(value, int):
        if abs(value) < _MAX_SAFE_EXPONENT:
            return str(value)
        value = float(value)
    if math.isnan(value) or math.isinf(value):
        raise ValueError("non-finite numbers are not representable in JSON")
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) < _MAX_SAFE_EXPONENT:
        return str(int(value))
    text = repr(value)
    return _normalize_exponent(text)


def _normalize_exponent(text: str) -> str:
    """`1e-07` -> `1e-7`, `1e+21` stays `1e+21` (JavaScript drops the leading zero)."""
    if "e" not in text:
        return text
    mantissa, exponent = text.split("e")
    sign = exponent[0]
    digits = exponent[1:].lstrip("0") or "0"
    return f"{mantissa}e{sign}{digits}"


def js_round(value: float) -> int:
    """`Math.round`: halves go towards +infinity (`Math.round(-2.5) == -2`)."""
    return math.floor(value + 0.5)


def to_fixed(value: float, digits: int) -> str:
    """`Number#toFixed`: halves go away from zero, computed on the exact binary value."""
    with localcontext() as context:
        context.prec = 60
        quantized = Decimal(value).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
        return f"{quantized:.{digits}f}"
