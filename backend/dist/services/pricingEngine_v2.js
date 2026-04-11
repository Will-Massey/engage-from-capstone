"use strict";
/**
 * Pricing Engine v2 - Clear and Intuitive Pricing
 *
 * Key Principles:
 * 1. Show prices as they are - £850/year shows as £850/year
 * 2. Annual equivalent shown for comparison only
 * 3. No confusing conversions
 * 4. VAT calculated clearly per line
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateLineItem = calculateLineItem;
exports.calculateProposalTotals = calculateProposalTotals;
exports.formatCurrency = formatCurrency;
exports.getBillingFrequencyLabel = getBillingFrequencyLabel;
exports.getBillingFrequencyShort = getBillingFrequencyShort;
/**
 * Calculate a single line item with clear pricing
 */
function calculateLineItem(input) {
    const { basePrice, billingFrequency, quantity = 1, discountPercent = 0, vatRate = 20 } = input;
    // Calculate totals
    const lineTotal = basePrice * quantity;
    const discountAmount = lineTotal * (discountPercent / 100);
    const netTotal = lineTotal - discountAmount;
    const vatAmount = Math.round(netTotal * (vatRate / 100) * 100) / 100;
    const grossTotal = netTotal + vatAmount;
    // Calculate annual equivalent for comparison
    let annualEquivalent = 0;
    switch (billingFrequency) {
        case 'MONTHLY':
            annualEquivalent = basePrice * 12;
            break;
        case 'QUARTERLY':
            annualEquivalent = basePrice * 4;
            break;
        case 'ANNUALLY':
            annualEquivalent = basePrice;
            break;
        case 'ONE_TIME':
            annualEquivalent = 0; // One-time doesn't have annual equivalent
            break;
        default:
            annualEquivalent = basePrice * 12;
    }
    // Determine price display mode
    let priceDisplayMode;
    switch (billingFrequency) {
        case 'MONTHLY':
            priceDisplayMode = 'PER_MONTH';
            break;
        case 'QUARTERLY':
            priceDisplayMode = 'PER_QUARTER';
            break;
        case 'ANNUALLY':
            priceDisplayMode = 'PER_YEAR';
            break;
        case 'ONE_TIME':
            priceDisplayMode = 'ONE_TIME';
            break;
        default:
            priceDisplayMode = 'PER_MONTH';
    }
    // Generate price label
    const formattedPrice = formatCurrency(basePrice);
    let priceLabel = '';
    switch (priceDisplayMode) {
        case 'PER_MONTH':
            priceLabel = `${formattedPrice}/month`;
            break;
        case 'PER_QUARTER':
            priceLabel = `${formattedPrice}/quarter`;
            break;
        case 'PER_YEAR':
            priceLabel = `${formattedPrice}/year`;
            break;
        case 'ONE_TIME':
            priceLabel = `${formattedPrice} one-time`;
            break;
    }
    return {
        displayPrice: basePrice,
        billingFrequency,
        priceDisplayMode,
        priceLabel,
        annualEquivalent,
        quantity,
        lineTotal,
        discountAmount,
        netTotal,
        vatAmount,
        grossTotal
    };
}
/**
 * Calculate proposal totals grouped by billing frequency
 */
function calculateProposalTotals(lineItems) {
    // Group items by billing frequency
    const grouped = {
        monthly: lineItems.filter(item => item.billingFrequency === 'MONTHLY'),
        quarterly: lineItems.filter(item => item.billingFrequency === 'QUARTERLY'),
        annually: lineItems.filter(item => item.billingFrequency === 'ANNUALLY'),
        oneTime: lineItems.filter(item => item.billingFrequency === 'ONE_TIME'),
    };
    // Calculate totals for each group
    const calculateGroup = (items) => ({
        subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
        vatAmount: items.reduce((sum, item) => sum + item.vatAmount, 0),
        total: items.reduce((sum, item) => sum + item.grossTotal, 0),
        items
    });
    const monthly = calculateGroup(grouped.monthly);
    const quarterly = calculateGroup(grouped.quarterly);
    const annually = calculateGroup(grouped.annually);
    const oneTime = calculateGroup(grouped.oneTime);
    // Calculate grand total and annual equivalent
    const grandTotal = monthly.total + quarterly.total + annually.total + oneTime.total;
    const totalAnnualEquivalent = monthly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
        quarterly.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0) +
        annually.items.reduce((sum, item) => sum + item.annualEquivalent * item.quantity, 0);
    // Determine primary billing frequency (most common)
    const counts = {
        MONTHLY: grouped.monthly.length,
        QUARTERLY: grouped.quarterly.length,
        ANNUALLY: grouped.annually.length,
        ONE_TIME: grouped.oneTime.length,
    };
    const primaryBillingFrequency = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])[0][0];
    return {
        monthly,
        quarterly,
        annually,
        oneTime,
        grandTotal,
        totalAnnualEquivalent,
        primaryBillingFrequency
    };
}
/**
 * Format currency for display
 */
function formatCurrency(amount, currency = 'GBP') {
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
}
/**
 * Get billing frequency label
 */
function getBillingFrequencyLabel(frequency) {
    switch (frequency) {
        case 'MONTHLY':
            return 'Monthly';
        case 'QUARTERLY':
            return 'Quarterly';
        case 'ANNUALLY':
            return 'Annual';
        case 'ONE_TIME':
            return 'One-time';
        case 'WEEKLY':
            return 'Weekly';
        default:
            return frequency;
    }
}
/**
 * Get short billing frequency label
 */
function getBillingFrequencyShort(frequency) {
    switch (frequency) {
        case 'MONTHLY':
            return '/mo';
        case 'QUARTERLY':
            return '/qtr';
        case 'ANNUALLY':
            return '/yr';
        case 'ONE_TIME':
            return '';
        case 'WEEKLY':
            return '/wk';
        default:
            return '';
    }
}
exports.default = {
    calculateLineItem,
    calculateProposalTotals,
    formatCurrency,
    getBillingFrequencyLabel,
    getBillingFrequencyShort
};
//# sourceMappingURL=pricingEngine_v2.js.map