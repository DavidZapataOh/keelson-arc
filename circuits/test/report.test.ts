import { expect, it } from "vitest";
import { renderReport } from "../scripts/report.ts";

it("renders one markdown row with grouped constraints and rounded timings", () => {
  const report = renderReport({
    cpu: "Test CPU",
    node: "v24.0.0",
    constraints: 25378,
    publicSignals: 13,
    ceremonyPower: 16,
    zkeyMb: 15.94,
    wasmMb: 4.02,
    proveMs: 923.6,
    verifyMs: 8.7,
  });
  expect(report).toContain("Test CPU, Node v24.0.0");
  expect(report).toContain(
    "| Compliance | 25,378 | 13 | 2^16 | 15.9 MB | 4.0 MB | 924 ms | 9 ms |",
  );
});
