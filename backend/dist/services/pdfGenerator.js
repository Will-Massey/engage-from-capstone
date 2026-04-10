"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFGenerator = void 0;
const pdfkit_1 = __importDefault(require("pdfkit"));
const database_js_1 = require("../config/database.js");
// Billing frequency labels for display
const BILLING_LABELS = {
    'MONTHLY': 'month',
    'QUARTERLY': 'quarter',
    'ANNUALLY': 'year',
    'ONE_TIME': 'one-time',
    'WEEKLY': 'week',
};
class PDFGenerator {
    /**
     * Generate a professional proposal PDF
     */
    static async generateProposal(proposalId) {
        // Fetch proposal with all related data
        const proposal = await database_js_1.prisma.proposal.findUnique({
            where: { id: proposalId },
            include: {
                client: true,
                createdBy: {
                    select: { firstName: true, lastName: true, email: true },
                },
                services: true,
                tenant: true,
            },
        });
        if (!proposal) {
            throw new Error('Proposal not found');
        }
        return this.createPDF(proposal);
    }
    /**
     * Create the PDF document
     */
    static createPDF(proposal) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new pdfkit_1.default({ margin: 50 });
                const chunks = [];
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('end', () => resolve(Buffer.concat(chunks)));
                doc.on('error', reject);
                // Primary and secondary colors
                const primaryColor = proposal.tenant.settings?.primaryColor || '#0ea5e9';
                const secondaryColor = '#666666';
                // ========== HEADER ==========
                this.drawHeader(doc, proposal, primaryColor);
                // ========== CLIENT INFO ==========
                this.drawClientInfo(doc, proposal);
                // ========== COVER LETTER ==========
                if (proposal.coverLetter) {
                    doc.addPage();
                    this.drawCoverLetter(doc, proposal);
                }
                // ========== SERVICES ==========
                doc.addPage();
                this.drawServices(doc, proposal, primaryColor);
                // ========== PRICING ==========
                this.drawPricing(doc, proposal, primaryColor);
                // ========== TERMS ==========
                if (proposal.terms) {
                    doc.addPage();
                    this.drawTerms(doc, proposal, primaryColor);
                }
                // ========== ACCEPTANCE ==========
                doc.addPage();
                this.drawAcceptance(doc, proposal, primaryColor);
                doc.end();
            }
            catch (error) {
                reject(error);
            }
        });
    }
    /**
     * Draw header section
     */
    static drawHeader(doc, proposal, primaryColor) {
        // Company Logo (if available)
        if (proposal.tenant.logo) {
            try {
                // Handle base64 logo
                const logoData = proposal.tenant.logo;
                if (logoData.startsWith('data:image')) {
                    const base64Data = logoData.split(',')[1];
                    const imgBuffer = Buffer.from(base64Data, 'base64');
                    doc.image(imgBuffer, 50, 40, { width: 120 });
                    doc.y = 130; // Move down past logo
                }
            }
            catch (error) {
                // Fall back to text if logo fails
                doc.fontSize(24)
                    .fillColor(primaryColor)
                    .text(proposal.tenant.name, 50, 50);
            }
        }
        else {
            // No logo - use company name
            doc.fontSize(24)
                .fillColor(primaryColor)
                .text(proposal.tenant.name, 50, 50);
        }
        // Proposal title
        doc.fontSize(14)
            .fillColor('#333333')
            .text('PROPOSAL', 400, 55, { align: 'right' });
        doc.fontSize(10)
            .fillColor('#666666')
            .text(`Ref: ${proposal.reference}`, { align: 'right' })
            .text(`Date: ${this.formatDate(proposal.createdAt)}`, { align: 'right' })
            .text(`Valid until: ${this.formatDate(proposal.validUntil)}`, { align: 'right' });
        // Divider line
        doc.moveTo(50, 100)
            .lineTo(550, 100)
            .strokeColor(primaryColor)
            .lineWidth(2)
            .stroke();
        // Title
        doc.moveDown(3)
            .fontSize(20)
            .fillColor('#333333')
            .text(proposal.title, { align: 'center' });
        doc.moveDown(1);
    }
    /**
     * Draw client information
     */
    static drawClientInfo(doc, proposal) {
        const startY = doc.y + 20;
        // Prepared for
        doc.fontSize(12)
            .fillColor('#333333')
            .text('Prepared for:', 50, startY);
        doc.fontSize(11)
            .fillColor('#666666');
        let y = startY + 20;
        doc.text(proposal.client.name, 50, y);
        y += 15;
        if (proposal.client.address) {
            const addr = proposal.client.address;
            if (addr.line1)
                doc.text(addr.line1, 50, y);
            y += 15;
            if (addr.line2) {
                doc.text(addr.line2, 50, y);
                y += 15;
            }
            if (addr.city) {
                doc.text(`${addr.city}${addr.postcode ? ', ' + addr.postcode : ''}`, 50, y);
                y += 15;
            }
        }
        y += 10;
        doc.text(`Email: ${proposal.client.contactEmail}`, 50, y);
        if (proposal.client.contactPhone) {
            y += 15;
            doc.text(`Phone: ${proposal.client.contactPhone}`, 50, y);
        }
        if (proposal.client.companyNumber) {
            y += 15;
            doc.text(`Company No: ${proposal.client.companyNumber}`, 50, y);
        }
        // Prepared by
        const rightX = 300;
        doc.fontSize(12)
            .fillColor('#333333')
            .text('Prepared by:', rightX, startY);
        doc.fontSize(11)
            .fillColor('#666666');
        y = startY + 20;
        doc.text(`${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`, rightX, y);
        y += 15;
        doc.text(proposal.createdBy.email, rightX, y);
    }
    /**
     * Draw cover letter / Introduction
     */
    static drawCoverLetter(doc, proposal) {
        // Introduction Header
        doc.fontSize(18)
            .fillColor('#333333')
            .text('Introduction', { align: 'center' });
        doc.moveDown(1);
        // Decorative line
        doc.moveTo(200, doc.y)
            .lineTo(400, doc.y)
            .strokeColor('#cccccc')
            .lineWidth(1)
            .stroke();
        doc.moveDown(1);
        doc.fontSize(11)
            .fillColor('#444444');
        // Default introduction template if no custom cover letter
        if (!proposal.coverLetter || proposal.coverLetter.trim().length < 50) {
            // Use default template
            const defaultIntro = `Dear ${proposal.client.name},

Thank you for considering ${proposal.tenant.name} for your accounting and business advisory needs. We appreciate the opportunity to present this proposal outlining our services and how we can support your business.

Following a thorough understanding of your requirements, we have prepared a tailored service package designed to provide you with comprehensive support while ensuring compliance with all relevant regulations.

This proposal details:
• The specific services we recommend for your business
• Transparent pricing with no hidden costs
• Our terms of engagement and service standards
• Next steps to get started

We believe in building long-term partnerships with our clients based on trust, transparency, and exceptional service delivery.

Please review this proposal at your convenience. Should you have any questions or require any clarification, please do not hesitate to contact us.

We look forward to the possibility of working with you.

Yours sincerely,

${proposal.createdBy.firstName} ${proposal.createdBy.lastName}
${proposal.tenant.name}`;
            const paragraphs = defaultIntro.split('\n\n');
            paragraphs.forEach((paragraph) => {
                if (paragraph.trim()) {
                    doc.text(paragraph.trim(), {
                        align: 'justify',
                        lineGap: 5,
                    });
                    doc.moveDown(1);
                }
            });
        }
        else {
            // Use custom cover letter
            const paragraphs = proposal.coverLetter.split('\n\n');
            paragraphs.forEach((paragraph) => {
                if (paragraph.trim()) {
                    doc.text(paragraph.trim(), {
                        align: 'justify',
                        lineGap: 5,
                    });
                    doc.moveDown(1);
                }
            });
        }
        // Page break before T&Cs note
        doc.moveDown(2);
        doc.fontSize(10)
            .fillColor('#666666')
            .text('Please turn over for full Terms and Conditions of Engagement →', { align: 'center' });
    }
    /**
     * Draw services section with clear pricing
     */
    static drawServices(doc, proposal, primaryColor) {
        doc.fontSize(16)
            .fillColor('#333333')
            .text('Services', { align: 'center' });
        doc.moveDown(1);
        // Group services by billing frequency
        const grouped = {
            monthly: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'MONTHLY'),
            quarterly: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'QUARTERLY'),
            annually: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'ANNUALLY'),
            oneTime: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'ONE_TIME'),
        };
        const drawServiceGroup = (title, services, frequency) => {
            if (services.length === 0)
                return;
            // Section header
            doc.fontSize(12)
                .fillColor(primaryColor)
                .text(title, 50, doc.y);
            doc.moveDown(0.5);
            // Table header
            const tableTop = doc.y;
            const colX = { name: 50, qty: 310, price: 380, total: 490 };
            doc.fontSize(9)
                .fillColor('#888888');
            doc.text('Service', colX.name, tableTop)
                .text('Qty', colX.qty, tableTop)
                .text('Price', colX.price, tableTop)
                .text('Total', colX.total, tableTop);
            // Header line
            doc.moveTo(50, tableTop + 15)
                .lineTo(550, tableTop + 15)
                .strokeColor('#CCCCCC')
                .lineWidth(0.5)
                .stroke();
            // Services rows
            doc.fontSize(10)
                .fillColor('#333333');
            let y = tableTop + 25;
            services.forEach((service) => {
                // Check if we need a new page
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }
                const displayPrice = service.displayPrice || service.unitPrice;
                const billingFreq = service.billingFrequency || service.frequency;
                const priceLabel = this.formatPriceWithFrequency(displayPrice, billingFreq);
                const lineTotal = (service.displayPrice || service.unitPrice) * service.quantity;
                doc.text(service.name, colX.name, y, { width: 250 });
                // Description if present
                if (service.description) {
                    doc.fontSize(8)
                        .fillColor('#666666')
                        .text(service.description, colX.name, y + 15, { width: 250 });
                    doc.fontSize(10)
                        .fillColor('#333333');
                }
                doc.text(service.quantity.toString(), colX.qty, y)
                    .text(priceLabel, colX.price, y)
                    .text(this.formatCurrency(lineTotal), colX.total, y);
                y += service.description ? 45 : 25;
            });
            // Group subtotal
            const subtotal = services.reduce((sum, s) => sum + ((s.displayPrice || s.unitPrice) * s.quantity), 0);
            y += 5;
            doc.fontSize(10)
                .fillColor(primaryColor)
                .text(`${title} Subtotal:`, colX.price, y)
                .text(this.formatCurrency(subtotal), colX.total, y);
            doc.moveDown(2);
        };
        // Draw each group
        drawServiceGroup('Monthly Services', grouped.monthly, 'MONTHLY');
        drawServiceGroup('Quarterly Services', grouped.quarterly, 'QUARTERLY');
        drawServiceGroup('Annual Services', grouped.annually, 'ANNUALLY');
        drawServiceGroup('One-Time Services', grouped.oneTime, 'ONE_TIME');
    }
    /**
     * Draw pricing summary with clear grouped totals
     */
    static drawPricing(doc, proposal, primaryColor) {
        doc.moveDown(2);
        // Group services by billing frequency
        const grouped = {
            monthly: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'MONTHLY'),
            quarterly: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'QUARTERLY'),
            annually: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'ANNUALLY'),
            oneTime: proposal.services.filter(s => (s.billingFrequency || s.frequency) === 'ONE_TIME'),
        };
        const rightX = 350;
        let y = doc.y;
        doc.fontSize(14)
            .fillColor('#333333')
            .text('Investment Summary', rightX, y);
        y += 30;
        doc.fontSize(10)
            .fillColor('#666666');
        // Show totals by frequency
        if (grouped.monthly.length > 0) {
            const monthlyTotal = grouped.monthly.reduce((sum, s) => {
                const price = s.displayPrice || s.unitPrice;
                return sum + (price * s.quantity);
            }, 0);
            const monthlyVat = monthlyTotal * 0.2;
            const monthlyWithVat = monthlyTotal + monthlyVat;
            doc.text('Monthly Total:', rightX, y)
                .text(this.formatCurrency(monthlyWithVat) + '/month', 490, y, { align: 'right' });
            y += 20;
        }
        if (grouped.quarterly.length > 0) {
            const quarterlyTotal = grouped.quarterly.reduce((sum, s) => {
                const price = s.displayPrice || s.unitPrice;
                return sum + (price * s.quantity);
            }, 0);
            const quarterlyVat = quarterlyTotal * 0.2;
            const quarterlyWithVat = quarterlyTotal + quarterlyVat;
            doc.text('Quarterly Total:', rightX, y)
                .text(this.formatCurrency(quarterlyWithVat) + '/quarter', 490, y, { align: 'right' });
            y += 20;
        }
        if (grouped.annually.length > 0) {
            const annualTotal = grouped.annually.reduce((sum, s) => {
                const price = s.displayPrice || s.unitPrice;
                return sum + (price * s.quantity);
            }, 0);
            const annualVat = annualTotal * 0.2;
            const annualWithVat = annualTotal + annualVat;
            doc.text('Annual Total:', rightX, y)
                .text(this.formatCurrency(annualWithVat) + '/year', 490, y, { align: 'right' });
            y += 20;
        }
        if (grouped.oneTime.length > 0) {
            const oneTimeTotal = grouped.oneTime.reduce((sum, s) => {
                const price = s.displayPrice || s.unitPrice;
                return sum + (price * s.quantity);
            }, 0);
            const oneTimeVat = oneTimeTotal * 0.2;
            const oneTimeWithVat = oneTimeTotal + oneTimeVat;
            doc.text('One-Time Fees:', rightX, y)
                .text(this.formatCurrency(oneTimeWithVat), 490, y, { align: 'right' });
            y += 20;
        }
        // Divider
        y += 10;
        doc.moveTo(rightX, y)
            .lineTo(550, y)
            .strokeColor(primaryColor)
            .lineWidth(1)
            .stroke();
        // Grand Total
        y += 15;
        doc.fontSize(16)
            .fillColor(primaryColor)
            .text('Total Investment:', rightX, y)
            .text(this.formatCurrency(proposal.total), 490, y, { align: 'right' });
        // Annual equivalent note
        const annualEquivalent = grouped.monthly.reduce((sum, s) => sum + ((s.displayPrice || s.unitPrice) * s.quantity * 12), 0) +
            grouped.quarterly.reduce((sum, s) => sum + ((s.displayPrice || s.unitPrice) * s.quantity * 4), 0) +
            grouped.annually.reduce((sum, s) => sum + ((s.displayPrice || s.unitPrice) * s.quantity), 0);
        if (annualEquivalent > 0) {
            y += 25;
            doc.fontSize(9)
                .fillColor('#888888')
                .text(`Annual equivalent: ${this.formatCurrency(annualEquivalent)}/year`, rightX, y);
        }
        // VAT breakdown
        y += 20;
        doc.fontSize(9)
            .fillColor('#666666')
            .text(`Includes VAT (20%): ${this.formatCurrency(proposal.vatAmount)}`, rightX, y);
        // Payment terms
        y += 30;
        doc.fontSize(10)
            .fillColor('#666666')
            .text(`Payment Terms: ${proposal.paymentTerms}`, rightX, y);
    }
    /**
     * Draw terms and conditions
     */
    static drawTerms(doc, proposal, primaryColor) {
        doc.fontSize(16)
            .fillColor('#333333')
            .text('Terms & Conditions', { align: 'center' });
        doc.moveDown(1);
        doc.fontSize(10)
            .fillColor('#444444');
        const paragraphs = (proposal.terms || '').split('\n\n');
        paragraphs.forEach((paragraph) => {
            if (paragraph.trim()) {
                doc.text(paragraph.trim(), {
                    align: 'justify',
                    lineGap: 4,
                });
                doc.moveDown(1);
            }
        });
    }
    /**
     * Draw acceptance page
     */
    static drawAcceptance(doc, proposal, primaryColor) {
        doc.fontSize(16)
            .fillColor('#333333')
            .text('Acceptance', { align: 'center' });
        doc.moveDown(2);
        doc.fontSize(11)
            .fillColor('#444444')
            .text('By signing below, you agree to the terms and conditions outlined in this proposal and authorize the commencement of services.', {
            align: 'justify',
        });
        doc.moveDown(2);
        // Signature boxes
        const y = doc.y;
        doc.fontSize(10)
            .fillColor('#333333')
            .text('Client Signature:', 50, y)
            .text('Date:', 350, y);
        // Signature lines
        doc.moveTo(50, y + 40)
            .lineTo(300, y + 40)
            .strokeColor('#999999')
            .lineWidth(0.5)
            .stroke();
        doc.moveTo(350, y + 40)
            .lineTo(550, y + 40)
            .strokeColor('#999999')
            .lineWidth(0.5)
            .stroke();
        doc.fontSize(9)
            .fillColor('#666666')
            .text('Signature', 50, y + 45)
            .text('DD/MM/YYYY', 350, y + 45);
        // Online acceptance note
        doc.moveDown(4);
        doc.fontSize(11)
            .fillColor(primaryColor)
            .text('Or accept online at:', { align: 'center' });
        const acceptanceUrl = `https://engage-frontend-0g6u.onrender.com/proposals/view/${proposal.id}`;
        doc.fontSize(10)
            .fillColor('#666666')
            .text(acceptanceUrl, { align: 'center', link: acceptanceUrl });
    }
    /**
     * Format currency
     */
    static formatCurrency(amount) {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount);
    }
    /**
     * Format price with frequency label
     */
    static formatPriceWithFrequency(price, frequency) {
        const formatted = this.formatCurrency(price);
        const label = BILLING_LABELS[frequency] || '';
        if (frequency === 'ONE_TIME') {
            return `${formatted}`;
        }
        return `${formatted}/${label}`;
    }
    /**
     * Format date
     */
    static formatDate(date) {
        return new Date(date).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}
exports.PDFGenerator = PDFGenerator;
exports.default = PDFGenerator;
//# sourceMappingURL=pdfGenerator.js.map