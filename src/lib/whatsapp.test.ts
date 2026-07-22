import { describe, expect, it } from "vitest";
import { normalizePhoneCO, waLink, waShareLink, paymentReminderMessage } from "./whatsapp";

describe("normalizePhoneCO", () => {
  it("prefixes country code 57 to a 10-digit CO mobile", () => {
    expect(normalizePhoneCO("3001234567")).toBe("573001234567");
    expect(normalizePhoneCO("300 123 4567")).toBe("573001234567");
    expect(normalizePhoneCO("(300) 123-4567")).toBe("573001234567");
  });
  it("keeps an already-prefixed 57 number", () => {
    expect(normalizePhoneCO("573001234567")).toBe("573001234567");
    expect(normalizePhoneCO("+57 300 123 4567")).toBe("573001234567");
  });
  it("strips a leading 00 international prefix", () => {
    expect(normalizePhoneCO("0057 300 1234567")).toBe("573001234567");
  });
  it("returns landline/other digits when >= 7", () => {
    expect(normalizePhoneCO("6017654321")).toBe("6017654321");
  });
  it("returns null for empty or too-short input", () => {
    expect(normalizePhoneCO("")).toBeNull();
    expect(normalizePhoneCO(null)).toBeNull();
    expect(normalizePhoneCO(undefined)).toBeNull();
    expect(normalizePhoneCO("12345")).toBeNull();
    expect(normalizePhoneCO("sin número")).toBeNull();
  });
});

describe("waLink", () => {
  it("builds a wa.me link with encoded text", () => {
    const link = waLink("3001234567", "Hola, ¿cómo está?");
    expect(link).toBe("https://wa.me/573001234567?text=Hola%2C%20%C2%BF" + "c%C3%B3mo%20est%C3%A1%3F");
  });
  it("omits the query when no text", () => {
    expect(waLink("3001234567", "")).toBe("https://wa.me/573001234567");
  });
  it("returns null for an unusable number", () => {
    expect(waLink("123", "hola")).toBeNull();
    expect(waLink(null, "hola")).toBeNull();
  });
  it("truncates very long messages", () => {
    const long = "a".repeat(3000);
    const link = waLink("3001234567", long)!;
    // encoded 'a' is 1 char; 1500 cap → 1500 a's
    expect(link).toContain("a".repeat(1500));
    expect(link).not.toContain("a".repeat(1501));
  });
});

describe("waShareLink", () => {
  it("builds a numberless share link", () => {
    expect(waShareLink("hola")).toBe("https://wa.me/?text=hola");
  });
});

describe("paymentReminderMessage", () => {
  it("includes the balance and, when given, the portal link", () => {
    const msg = paymentReminderMessage({
      propertyName: "Torres del Parque",
      unitLabel: "Apto 502",
      balanceText: "$350.000",
      portalUrl: "https://x.com/u/abc",
    });
    expect(msg).toContain("Torres del Parque");
    expect(msg).toContain("Apto 502");
    expect(msg).toContain("$350.000");
    expect(msg).toContain("https://x.com/u/abc");
  });
  it("works without a portal link", () => {
    const msg = paymentReminderMessage({ propertyName: "X", unitLabel: "Y", balanceText: "$1" });
    expect(msg).toContain("$1");
    expect(msg).not.toContain("http");
  });
});
