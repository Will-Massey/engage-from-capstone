/**
 * UK-Compliant Default Cover Letter with Subtle NLP Techniques
 * 
 * NLP Techniques Used:
 * - Presuppositions (assumes the deal is happening)
 * - Embedded commands (hidden directives)
 * - Authority positioning (professional credibility)
 * - Future pacing (client visualizing success)
 * - Social proof (implied through professional standards)
 * - Agreement frames (yes-set pattern)
 * - Scarcity/urgency (subtle, professional)
 */

export const generateDefaultCoverLetter = (params: {
  clientName: string;
  businessName: string;
  accountingYear: string;
  proposalDate: string;
}): string => {
  const { clientName, businessName, accountingYear, proposalDate } = params;
  
  return `Dear ${clientName},

Thank you for taking the time to review this proposal for your accounting and taxation services for the ${accountingYear} financial year.

**You already know** that having the right accounting partner makes all the difference to a growing business. Many successful business owners discover that professional accountancy support isn't just about compliance—it's about creating the financial clarity that drives better decisions.

**As you read through** the services outlined in this proposal, you'll notice how each element has been carefully tailored to support ${businessName}'s specific circumstances. We've taken into account your business structure, industry requirements, and growth trajectory to ensure you receive exactly the support you need.

**By choosing to proceed** with this engagement, you can expect:

• **Peace of mind** knowing your statutory obligations are handled accurately and on time
• **Clear visibility** of your financial position through regular management information  
• **Proactive advice** that helps you minimise tax liabilities within the legal framework
• **Dedicated support** from a team that understands your business and its objectives

**You'll find** that our approach combines the latest cloud accounting technology with the personal service that only comes from a relationship-focused practice. This means you benefit from real-time financial data whilst having direct access to experienced professionals who can interpret what those numbers mean for your business.

**When business owners work with us**, they often remark on how much more confident they feel about their financial decisions. As your accountants, we become an integral part of your team—helping you navigate not just the numbers, but the strategic implications behind them.

**I invite you to review** the detailed service breakdown and terms enclosed. Should you have any questions or wish to discuss any aspect of this proposal, please don't hesitate to contact me directly on the number below. Many clients find it helpful to arrange a brief call to walk through the proposal together and ensure everything is perfectly aligned with their expectations.

**Once you're ready to proceed**, simply accept this proposal electronically or return a signed copy. We'll then arrange your onboarding and can typically have your systems set up within 48 hours.

**The sooner we begin**, the sooner you'll have the financial clarity and compliance confidence that lets you focus on what you do best—growing ${businessName}.

Thank you for considering us as your accounting partners. We look forward to supporting your success.

Warm regards,

[Your Name]
[Your Title]
[Practice Name]

Direct: [Phone Number]
Email: [Email Address]

P.S. This proposal remains valid for 30 days from the date of issue. Given the time-sensitive nature of some tax planning opportunities, **you may want to secure your preferred start date** by accepting promptly.

---

**About This Proposal**

Date: ${proposalDate}
Proposal Reference: Will be generated upon acceptance
Valid Until: 30 days from date of issue

This document constitutes a formal proposal for professional services under the terms and conditions set out herein. Acceptance of this proposal constitutes agreement to our standard terms of engagement, a copy of which is included for your review.`;
};

export default generateDefaultCoverLetter;
