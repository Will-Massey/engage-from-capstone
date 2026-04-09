"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIPTION_TIERS = exports.STRIPE_PRICE_IDS = exports.stripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
// Make Stripe optional - app can start without payments configured
exports.stripe = STRIPE_SECRET_KEY
    ? new stripe_1.default(STRIPE_SECRET_KEY, {
        apiVersion: '2025-02-24.acacia',
        typescript: true,
    })
    : null;
// Price IDs for different plans
exports.STRIPE_PRICE_IDS = {
    STARTER: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
    PROFESSIONAL: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_professional',
    ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_enterprise',
};
// Subscription tiers configuration with prices
exports.SUBSCRIPTION_TIERS = {
    STARTER: {
        name: 'Starter',
        description: 'Perfect for small practices',
        price: 49,
        priceId: exports.STRIPE_PRICE_IDS.STARTER,
        maxUsers: 3,
        maxClients: 50,
        maxProposals: 100,
        features: ['Basic proposals', 'Client management', 'Email integration', 'MTD ITSA tracking'],
    },
    PROFESSIONAL: {
        name: 'Professional',
        description: 'For growing practices',
        price: 99,
        priceId: exports.STRIPE_PRICE_IDS.PROFESSIONAL,
        maxUsers: 10,
        maxClients: 500,
        maxProposals: 'Unlimited',
        features: ['Everything in Starter', 'Custom branding', 'Advanced analytics', 'Priority support', 'API access'],
    },
    ENTERPRISE: {
        name: 'Enterprise',
        description: 'For large firms',
        price: 249,
        priceId: exports.STRIPE_PRICE_IDS.ENTERPRISE,
        maxUsers: 'Unlimited',
        maxClients: 'Unlimited',
        maxProposals: 'Unlimited',
        features: ['Everything in Professional', 'White-label options', 'Dedicated support', 'Custom integrations', 'SLA guarantee'],
    },
};
exports.default = exports.stripe;
//# sourceMappingURL=stripe.js.map