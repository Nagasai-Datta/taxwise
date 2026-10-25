import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/chat/route";

/**
 * The chat endpoint itself, not only the kernel behind it.
 *
 * A form coming back carries values and no typed message. The empty-message
 * check once ran first and rejected every Form 16 and invoice submission,
 * which no kernel test could see.
 */
async function post(body: Record<string, unknown>) {
  const res = await POST(new Request("http://test/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json() };
}

describe("the chat endpoint", () => {
  it("accepts a submitted Form 16 and prepares the return", async () => {
    const { status, json } = await post({
      profileId: "PRIYA-001", resumeTool: "prepare_itr",
      values: { salary17_1: 1200000, hraExempt10_13A: 240000, tdsDeducted: 87880, deduction80C: 50000 },
    });
    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(json.component).toBe("itr_summary");
  });

  it("accepts a submitted invoice form and prepares the invoice", async () => {
    const { status, json } = await post({
      profileId: "ROHAN-003", resumeTool: "generate_invoice",
      values: { clientName: "Lotus Interiors", description: "Design work", amount: 200000, isExport: "no", chargeGST: "yes" },
    });
    expect(status).toBe(200);
    expect(json.component).toBe("invoice");
  });

  it("still rejects an empty message that is not a form", async () => {
    const { status, json } = await post({ profileId: "PRIYA-001", message: "" });
    expect(status).toBe(400);
    expect(json.error).toBe("Empty message");
  });
});
