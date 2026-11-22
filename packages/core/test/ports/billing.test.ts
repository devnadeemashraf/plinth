import { describe, expect, it } from "vitest";
import { BadRequestError } from "@/errors/index.js";
import {
  calculateLineItemsTotal,
  validateGstin,
  validateHsnCode,
  validateLineItems,
  validateMinorUnitAmount,
} from "@/ports/billing.js";

describe("packages/core / ports/billing", () => {
  describe("Category 1: Happy Path", () => {
    it("accepts valid positive integer minor-unit amounts", () => {
      expect(() => validateMinorUnitAmount(0)).not.toThrow();
      expect(() => validateMinorUnitAmount(100)).not.toThrow();
      expect(() => validateMinorUnitAmount(50000)).not.toThrow();
      expect(() => validateMinorUnitAmount(100000000)).not.toThrow();
    });

    it("validates well-formed line items and calculates totals", () => {
      const items = [
        {
          name: "Pro Subscription",
          amount: 50000, // ₹500.00
          currency: "INR",
          quantity: 1,
          hsnCode: "998313",
          gstRatePercent: 18,
        },
        {
          name: "Additional Seat",
          amount: 10000, // ₹100.00
          currency: "INR",
          quantity: 2,
        },
      ];

      expect(() => validateLineItems(items)).not.toThrow();
      const total = calculateLineItemsTotal(items);
      expect(total).toBe(70000);
    });

    it("validates correct Indian GSTIN identifiers", () => {
      // 29 (State) + AAAAA0000A (PAN) + 1 (entity) + Z (default) + 5 (checksum)
      expect(validateGstin("29ABCDE1234F1Z5")).toBe(true);
      expect(validateGstin("07AAAAA0000A1Z5")).toBe(true);
    });

    it("validates standard HSN / SAC codes", () => {
      expect(validateHsnCode("9983")).toBe(true);
      expect(validateHsnCode("998313")).toBe(true);
      expect(validateHsnCode("84713010")).toBe(true);
    });
  });

  describe("Category 2: Boundary & Fuzzing", () => {
    it("rejects floating-point monetary values", () => {
      expect(() => validateMinorUnitAmount(10.5)).toThrow(BadRequestError);
      expect(() => validateMinorUnitAmount(99.999)).toThrow(BadRequestError);
      expect(() => validateMinorUnitAmount(0.01)).toThrow(BadRequestError);
    });

    it("rejects negative monetary amounts", () => {
      expect(() => validateMinorUnitAmount(-1)).toThrow(BadRequestError);
      expect(() => validateMinorUnitAmount(-50000)).toThrow(BadRequestError);
    });

    it("rejects NaN and Infinities", () => {
      expect(() => validateMinorUnitAmount(Number.NaN)).toThrow(BadRequestError);
      expect(() => validateMinorUnitAmount(Number.POSITIVE_INFINITY)).toThrow(BadRequestError);
      expect(() => validateMinorUnitAmount(Number.NEGATIVE_INFINITY)).toThrow(BadRequestError);
    });

    it("rejects empty line items list", () => {
      expect(() => validateLineItems([])).toThrow(BadRequestError);
    });

    it("rejects line items with zero or negative quantities", () => {
      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "USD",
            quantity: 0,
          },
        ]),
      ).toThrow(BadRequestError);

      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "USD",
            quantity: -2,
          },
        ]),
      ).toThrow(BadRequestError);
    });

    it("rejects invalid line item names, currencies, and HSN codes", () => {
      // Empty or invalid item name
      expect(() =>
        validateLineItems([
          {
            name: "",
            amount: 1000,
            currency: "USD",
            quantity: 1,
          },
        ]),
      ).toThrow(BadRequestError);

      expect(() =>
        validateLineItems([
          {
            name: "   ",
            amount: 1000,
            currency: "USD",
            quantity: 1,
          },
        ]),
      ).toThrow(BadRequestError);

      // Invalid currency
      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "US", // length != 3
            quantity: 1,
          },
        ]),
      ).toThrow(BadRequestError);

      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "USDT", // length != 3
            quantity: 1,
          },
        ]),
      ).toThrow(BadRequestError);

      // Invalid HSN code
      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "USD",
            quantity: 1,
            hsnCode: "invalid_hsn",
          },
        ]),
      ).toThrow(BadRequestError);

      // Invalid GST rate
      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "INR",
            quantity: 1,
            gstRatePercent: -5,
          },
        ]),
      ).toThrow(BadRequestError);

      expect(() =>
        validateLineItems([
          {
            name: "Test",
            amount: 1000,
            currency: "INR",
            quantity: 1,
            gstRatePercent: 105,
          },
        ]),
      ).toThrow(BadRequestError);

      // Non-array input
      expect(() => validateLineItems(null as unknown as readonly [])).toThrow(BadRequestError);
    });

    it("detects line item amount overflow in calculateLineItemsTotal", () => {
      expect(() =>
        calculateLineItemsTotal([
          {
            name: "Overflow item",
            amount: Number.MAX_SAFE_INTEGER,
            currency: "USD",
            quantity: 2,
          },
        ]),
      ).toThrow(BadRequestError);
    });
  });

  describe("Category 5: Security & Verification", () => {
    it("rejects non-string and malformed GSTIN formats", () => {
      expect(validateGstin(null as unknown as string)).toBe(false);
      expect(validateGstin(undefined as unknown as string)).toBe(false);
      expect(validateGstin("")).toBe(false);
      expect(validateGstin("INVALID_GSTIN")).toBe(false);
      expect(validateGstin("29abcde1234f1z5")).toBe(false); // lowercase rejected
      expect(validateGstin("29ABCDE1234F1Z")).toBe(false); // too short
      expect(validateGstin("29ABCDE1234F1Z5X")).toBe(false); // too long
    });

    it("rejects non-string and malformed HSN codes", () => {
      expect(validateHsnCode(null as unknown as string)).toBe(false);
      expect(validateHsnCode(undefined as unknown as string)).toBe(false);
      expect(validateHsnCode("")).toBe(false);
      expect(validateHsnCode("99A1")).toBe(false);
      expect(validateHsnCode("12")).toBe(false); // too short (< 4 digits)
      expect(validateHsnCode("123456789")).toBe(false); // too long (> 8 digits)
    });
  });
});
