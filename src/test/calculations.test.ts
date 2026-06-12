import { describe, expect, it } from "vitest";
import { fmtBRLCompact } from "@/utils/calculations";

describe("formatação monetária compacta", () => {
  it("compacta milhares e milhões para KPIs", () => {
    expect(fmtBRLCompact(761_072.49)).toBe("R$ 761,1 mil");
    expect(fmtBRLCompact(1_200_000)).toBe("R$ 1,2 mi");
  });
});
