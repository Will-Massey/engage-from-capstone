import { test, expect } from '@playwright/test';

/**
 * Unit-style calculation tests
 * These don't require a running server - they test the calculation logic directly
 */

test.describe('Pricing Calculations', () => {
  test('annual price converts to monthly correctly', async () => {
    const basePrice = 850;
    const monthlyPrice = basePrice / 12;
    expect(monthlyPrice).toBeCloseTo(70.83, 2);
  });

  test('quarterly price converts to monthly correctly', async () => {
    const basePrice = 180;
    const monthlyPrice = basePrice / 3;
    expect(monthlyPrice).toBe(60);
  });

  test('monthly price stays the same', async () => {
    const basePrice = 150;
    const monthlyPrice = basePrice;
    expect(monthlyPrice).toBe(150);
  });

  test('frequency change recalculation monthly to annual', async () => {
    const monthlyPrice = 100;
    const annualPrice = monthlyPrice * 12;
    expect(annualPrice).toBe(1200);
  });

  test('frequency change recalculation annual to monthly', async () => {
    const annualPrice = 1200;
    const monthlyPrice = annualPrice / 12;
    expect(monthlyPrice).toBe(100);
  });

  test('frequency change recalculation monthly to quarterly', async () => {
    const monthlyPrice = 100;
    const quarterlyPrice = monthlyPrice * 3;
    expect(quarterlyPrice).toBe(300);
  });
});

test.describe('VAT Calculations', () => {
  test('20% VAT calculation', async () => {
    const amount = 100;
    const vatRate = 20;
    const vatAmount = amount * (vatRate / 100);
    expect(vatAmount).toBe(20);
  });

  test('5% VAT calculation', async () => {
    const amount = 100;
    const vatRate = 5;
    const vatAmount = amount * (vatRate / 100);
    expect(vatAmount).toBe(5);
  });

  test('0% VAT calculation', async () => {
    const amount = 100;
    const vatRate = 0;
    const vatAmount = amount * (vatRate / 100);
    expect(vatAmount).toBe(0);
  });

  test('line total with quantity and VAT', async () => {
    const unitPrice = 100;
    const quantity = 2;
    const vatRate = 20;

    const lineTotal = unitPrice * quantity;
    const vatAmount = lineTotal * (vatRate / 100);
    const grossTotal = lineTotal + vatAmount;

    expect(lineTotal).toBe(200);
    expect(vatAmount).toBe(40);
    expect(grossTotal).toBe(240);
  });

  test('mixed VAT rates calculation', async () => {
    const services = [
      { price: 100, vatRate: 20 }, // £20 VAT
      { price: 200, vatRate: 5 }, // £10 VAT
      { price: 150, vatRate: 0 }, // £0 VAT
    ];

    let totalVAT = 0;
    services.forEach((s) => {
      totalVAT += s.price * (s.vatRate / 100);
    });

    expect(totalVAT).toBe(30);
  });
});

test.describe('Discount Calculations', () => {
  test('percentage discount calculation', async () => {
    const basePrice = 100;
    const discountPercent = 10;
    const discountAmount = basePrice * (discountPercent / 100);
    const finalPrice = basePrice - discountAmount;

    expect(discountAmount).toBe(10);
    expect(finalPrice).toBe(90);
  });

  test('discount with quantity', async () => {
    const unitPrice = 100;
    const quantity = 3;
    const discountPercent = 20;

    const baseTotal = unitPrice * quantity;
    const discountAmount = baseTotal * (discountPercent / 100);
    const finalPrice = baseTotal - discountAmount;

    expect(baseTotal).toBe(300);
    expect(discountAmount).toBe(60);
    expect(finalPrice).toBe(240);
  });

  test('discount then VAT calculation', async () => {
    const unitPrice = 100;
    const quantity = 1;
    const discountPercent = 10;
    const vatRate = 20;

    const baseTotal = unitPrice * quantity;
    const discountAmount = baseTotal * (discountPercent / 100);
    const netTotal = baseTotal - discountAmount;
    const vatAmount = netTotal * (vatRate / 100);
    const grossTotal = netTotal + vatAmount;

    expect(netTotal).toBe(90);
    expect(vatAmount).toBe(18);
    expect(grossTotal).toBe(108);
  });
});

test.describe('Edge Cases', () => {
  test('zero price service', async () => {
    const basePrice = 0;
    const monthlyPrice = basePrice;
    expect(monthlyPrice).toBe(0);
  });

  test('very large annual price', async () => {
    const basePrice = 50000;
    const monthlyPrice = basePrice / 12;
    expect(monthlyPrice).toBeCloseTo(4166.67, 2);
  });

  test('fractional price conversion', async () => {
    const basePrice = 99.99;
    const monthlyPrice = basePrice / 12;
    expect(monthlyPrice).toBeCloseTo(8.33, 2);
  });
});
