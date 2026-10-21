import { describe, expect, it } from "vitest";
import { evaluateCalculator } from "./calculator";

describe("calculator arithmetic from shared phone state", () => {
  it("supports precedence, decimal values and negative numbers", () => {
    expect(evaluateCalculator("12 + 3 × 4 ÷ 2")).toBe(18);
    expect(evaluateCalculator("-(2 + .5) * -2")).toBe(5);
  });
  it("rejects executable state, incomplete input and division by zero", () => {
    for (const expression of ["globalThis.alert(1)", "1;fetch('/api/phone')", "1/0", "2+", "(1", "1..2", ""]) {
      expect(() => evaluateCalculator(expression)).toThrow();
    }
  });
});
