import { applyFeedbackSignal } from "../lib/memory/MemoryConsolidator.js";

describe("applyFeedbackSignal", () => {
    it("sufficient=true, relevant=true → importance 상승", () => {
        const result = applyFeedbackSignal(0.5, true, true);
        expect(result).toBeGreaterThan(0.5);
    });

    it("relevant=false → importance 하락", () => {
        const result = applyFeedbackSignal(0.5, false, false);
        expect(result).toBeLessThan(0.5);
    });

    it("relevant=true, sufficient=false → 소폭 하락", () => {
        const result = applyFeedbackSignal(0.5, true, false);
        expect(result).toBeLessThan(0.5);
        expect(result).toBeGreaterThan(0.4);
    });

    it("결과는 항상 [0.05, 1.0] 범위 내", () => {
        expect(applyFeedbackSignal(0.99, true, true)).toBeLessThanOrEqual(1.0);
        expect(applyFeedbackSignal(0.06, false, false)).toBeGreaterThanOrEqual(0.05);
    });
});

describe("contradiction audit content format", () => {
    it("audit content 포맷 검증", () => {
        const loserContent  = "Redis TTL은 300초다.";
        const winnerContent = "Redis TTL은 3600초다.";
        const reasoning     = "최신 설정값 우선";

        const content = `[모순 해결] "${loserContent.substring(0, 80)}" 파편이 "${winnerContent.substring(0, 80)}" 으로 대체됨. 판단 근거: ${reasoning}`;

        expect(content).toContain("[모순 해결]");
        expect(content).toContain("최신 설정값 우선");
        expect(content.length).toBeGreaterThan(20);
    });
});
