/** Parse calculator arithmetic without executing JavaScript from synced phone state. */
export function evaluateCalculator(expression: string): number {
  const source = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!source || source.length > 256 || /[^0-9.+*/()-]/.test(source)) throw new Error("Invalid calculator expression");
  let offset = 0;
  const primary = (): number => {
    if (source[offset] === "+") { offset++; return primary(); }
    if (source[offset] === "-") { offset++; return -primary(); }
    if (source[offset] === "(") {
      offset++; const value = sum();
      if (source[offset++] !== ")") throw new Error("Unclosed parentheses");
      return value;
    }
    const token = source.slice(offset).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)?.[0];
    if (!token) throw new Error("Expected a number");
    offset += token.length; return Number(token);
  };
  const product = (): number => {
    let value = primary();
    while (source[offset] === "*" || source[offset] === "/") {
      const operator = source[offset++], right = primary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (source[offset] === "+" || source[offset] === "-") {
      const operator = source[offset++], right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  const value = sum();
  if (offset !== source.length || !Number.isFinite(value)) throw new Error("Invalid calculation");
  return value;
}
