import PDFDocument from 'pdfkit';

// pdfkit types export the constructor as a value, not a type
// Use any for the document type to avoid TS2749 errors
type PDFDoc = any;
import { prisma } from '../config/database.js';

interface ProposalData {
  id: string;
  reference: string;
  title: string;
  status: string;
  validUntil: Date;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
  paymentTerms: string;
  paymentFrequency: string;
  coverLetter?: string;
  terms?: string;
  notes?: string;
  createdAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  signatoryPosition?: string;
  signature?: string;
  client: {
    name: string;
    companyType: string;
    contactEmail: string;
    contactPhone?: string;
    contactName?: string;
    address?: any;
    companyNumber?: string;
    vatNumber?: string;
  };
  createdBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
  services: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    displayPrice?: number;
    billingFrequency?: string;
    total: number;
    vatRate?: number;
    vatAmount?: number;
    grossTotal?: number;
    frequency: string;
    oneOffDueDate?: Date | string | null;
  }>;
  tenant: {
    name: string;
    logo?: string;
    settings: any;
  };
}

// Billing frequency labels for display
const BILLING_LABELS: Record<string, string> = {
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUALLY: 'year',
  ONE_TIME: 'one-time',
  WEEKLY: 'week',
};

export class PDFGenerator {
  /**
   * Generate a professional proposal PDF
   */
  static async generateProposal(proposalId: string): Promise<Buffer> {
    // Fetch proposal with all related data
    const proposal = (await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        client: {
          select: {
            name: true,
            companyType: true,
            contactEmail: true,
            contactPhone: true,
            contactName: true,
            address: true,
            companyNumber: true,
            vatNumber: true,
          },
        },
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        services: true,
        tenant: true,
        signatures: {
          orderBy: { signedAt: 'desc' as const },
          take: 1,
        },
      },
    })) as unknown as ProposalData & { signatures?: any[] };

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    return this.createPDF(proposal);
  }

  /**
   * Create the PDF document
   */
  private static createPDF(proposal: ProposalData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

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
        doc.addPage();
        this.drawCoverLetter(doc, proposal);

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
        if (proposal.status === 'ACCEPTED' && proposal.signature) {
          this.drawSignedAcceptance(doc, proposal, primaryColor);
          if ((proposal as any).signatures?.[0]) {
            doc.addPage();
            this.drawSignatureCertificate(doc, proposal, (proposal as any).signatures[0]);
          }
        } else {
          this.drawAcceptance(doc, proposal, primaryColor);
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw header section
   */
  private static drawHeader(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    let logoBottomY = 50;

    // Company Logo (if available)
    if (proposal.tenant.logo) {
      try {
        // Handle base64 logo
        const logoData = proposal.tenant.logo;
        if (logoData.startsWith('data:image')) {
          const base64Data = logoData.split(',')[1];
          const imgBuffer = Buffer.from(base64Data, 'base64');
          doc.image(imgBuffer, 50, 40, { width: 120 });
          logoBottomY = 160; // Logo drawn at y=40 with width 120, give plenty of clearance
        }
      } catch (error) {
        // Fall back to text if logo fails
        doc.fontSize(24).fillColor(primaryColor).text(proposal.tenant.name, 50, 50);
        logoBottomY = 80;
      }
    } else {
      // No logo - use company name
      doc.fontSize(24).fillColor(primaryColor).text(proposal.tenant.name, 50, 50);
      logoBottomY = 80;
    }

    // Proposal title
    doc.fontSize(14).fillColor('#333333').text('PROPOSAL', 400, 55, { align: 'right' });

    doc
      .fontSize(10)
      .fillColor('#666666')
      .text(`Ref: ${proposal.reference}`, { align: 'right' })
      .text(`Date: ${this.formatDate(proposal.createdAt)}`, { align: 'right' })
      .text(`Valid until: ${this.formatDate(proposal.validUntil)}`, { align: 'right' });

    // Divider line — drawn below the logo area so it never intersects
    const dividerY = Math.max(logoBottomY, doc.y + 10);
    doc.moveTo(50, dividerY).lineTo(550, dividerY).strokeColor(primaryColor).lineWidth(2).stroke();

    // Title
    doc.moveDown(3).fontSize(20).fillColor('#333333').text(proposal.title, { align: 'center' });

    doc.moveDown(1);
  }

  /**
   * Draw client information
   */
  private static drawClientInfo(doc: PDFDoc, proposal: ProposalData) {
    const startY = doc.y + 20;

    // Prepared for
    doc.fontSize(12).fillColor('#333333').text('Prepared for:', 50, startY);

    doc.fontSize(11).fillColor('#666666');

    let y = startY + 20;
    doc.text(proposal.client.name, 50, y);
    y += 15;

    if (proposal.client.address) {
      const addr = proposal.client.address;
      if (addr.line1) doc.text(addr.line1, 50, y);
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
    doc.fontSize(12).fillColor('#333333').text('Prepared by:', rightX, startY);

    doc.fontSize(11).fillColor('#666666');

    y = startY + 20;
    doc.text(`${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`, rightX, y);
    y += 15;
    doc.text(proposal.createdBy.email, rightX, y);
  }

  /**
   * Draw cover letter / Introduction
   */
  private static drawCoverLetter(doc: PDFDoc, proposal: ProposalData) {
    // Introduction Header
    doc.fontSize(18).fillColor('#333333').text('Introduction', { align: 'center' });

    doc.moveDown(1);

    // Decorative line
    doc.moveTo(200, doc.y).lineTo(400, doc.y).strokeColor('#cccccc').lineWidth(1).stroke();

    doc.moveDown(1);

    doc.fontSize(11).fillColor('#444444');

    // Default introduction template if no custom cover letter
    if (!proposal.coverLetter || proposal.coverLetter.trim().length < 50) {
      // Use director's first name if available, otherwise fall back to business name
      const directorFirstName = proposal.client.contactName
        ? proposal.client.contactName.split(' ')[0]
        : proposal.client.name;
      // Neutral professional fallback (the real tone is set via the 3 cover letter options in the builder)
      const defaultIntro = `Dear ${directorFirstName},

Thank you for the opportunity to present this proposal for the services outlined to ${proposal.client.name}. Following our discussion, we have set out the scope of work, fee structure, and terms.

${proposal.tenant.name} is committed to delivering the approach described and the standards expected of a professional practice.

We are happy to discuss any aspect of this proposal at your convenience.

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
    } else {
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
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Please turn over for full Terms and Conditions of Engagement →', { align: 'center' });
  }

  /**
   * Draw services section as a flat list
   */
  private static drawServices(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    doc.fontSize(16).fillColor('#333333').text('Services', { align: 'center' });

    doc.moveDown(1);

    if (!proposal.services || proposal.services.length === 0) return;

    // Table header
    const tableTop = doc.y;
    const colX = { name: 50, qty: 310, price: 380, total: 490 };

    doc.fontSize(9).fillColor('#888888');

    doc
      .text('Service', colX.name, tableTop)
      .text('Qty', colX.qty, tableTop)
      .text('Price', colX.price, tableTop)
      .text('Total', colX.total, tableTop);

    // Header line
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .strokeColor('#CCCCCC')
      .lineWidth(0.5)
      .stroke();

    // Services rows — flat list, no grouping
    doc.fontSize(10).fillColor('#333333');

    let y = tableTop + 25;

    proposal.services.forEach((service) => {
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
        doc
          .fontSize(8)
          .fillColor('#666666')
          .text(service.description, colX.name, y + 15, { width: 250 });
        doc.fontSize(10).fillColor('#333333');
      }

      let extraLines = 0;
      if (billingFreq === 'ONE_TIME' && service.oneOffDueDate) {
        const due = new Date(service.oneOffDueDate as any);
        if (!Number.isNaN(due.getTime())) {
          doc
            .fontSize(8)
            .fillColor('#666666')
            .text(`Due: ${this.formatDate(due)}`, colX.name, y + (service.description ? 30 : 15), {
              width: 250,
            });
          doc.fontSize(10).fillColor('#333333');
          extraLines = 1;
        }
      }

      doc
        .text(service.quantity.toString(), colX.qty, y)
        .text(priceLabel, colX.price, y)
        .text(this.formatCurrency(lineTotal), colX.total, y);

      const baseStep = service.description ? 45 : 25;
      y += baseStep + (extraLines ? 14 : 0);
    });

    doc.moveDown(2);
  }

  /**
   * Draw pricing summary with clear grouped totals
   */
  private static drawPricing(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    doc.moveDown(2);

    // Determine effective frequency using name-based overrides for known services
    const getEffectiveFrequency = (s: (typeof proposal.services)[0]): string => {
      const name = s.name.toLowerCase();
      // Annual services — year-end compliance billed annually (not monthly retainer)
      if (
        name.includes('dormant company accounts') ||
        name.includes('dormant accounts') ||
        name.includes('prior year') ||
        name.includes('prior accounts') ||
        name.includes('company formation') ||
        name.includes('self assessment') ||
        name.includes('self-assessment') ||
        name.includes('p11d') ||
        name.includes('audit services')
      ) {
        return 'ANNUALLY';
      }
      // One-off / project services
      if (
        name.includes('xero setup') ||
        name.includes('dext setup') ||
        name.includes('dext subscription') ||
        name.includes('company valuation') ||
        name.includes('due diligence') ||
        name.includes('forensic accounting') ||
        name.includes('insolvency') ||
        name.includes('international tax') ||
        name.includes('mtd itsa transition') ||
        name.includes('mtd itsa support') ||
        name.includes('property tax advisory') ||
        name.includes('r&d tax credit') ||
        name.includes('share scheme') ||
        name.includes('tax planning consultation') ||
        name.includes('business structure review') ||
        name.includes('capital allowances') ||
        name.includes('cash flow forecasting')
      ) {
        return 'ONE_TIME';
      }
      // Compliance retainers (annual accounts, CT600, CS01, AML) — monthly instalments
      if (
        name.includes('annual accounts') ||
        name.includes('ct600') ||
        name.includes('corporation tax return') ||
        name.includes('confirmation statement') ||
        name.includes('aml check') ||
        name.includes('anti-money laundering')
      ) {
        return 'MONTHLY';
      }
      return s.billingFrequency || s.frequency;
    };

    // Group services by effective billing frequency
    const grouped = {
      weekly: proposal.services.filter((s) => getEffectiveFrequency(s) === 'WEEKLY'),
      monthly: proposal.services.filter((s) => getEffectiveFrequency(s) === 'MONTHLY'),
      quarterly: proposal.services.filter((s) => getEffectiveFrequency(s) === 'QUARTERLY'),
      annually: proposal.services.filter((s) => getEffectiveFrequency(s) === 'ANNUALLY'),
      oneTime: proposal.services.filter((s) => getEffectiveFrequency(s) === 'ONE_TIME'),
    };

    const lineIncVat = (s: (typeof proposal.services)[0]) => {
      if (typeof s.grossTotal === 'number') return s.grossTotal;
      const net = (s.displayPrice || s.unitPrice || 0) * (s.quantity || 1);
      const vatR = s.vatRate ?? 20;
      return Math.round(net * (1 + vatR / 100) * 100) / 100;
    };

    const rightX = 350;
    let y = doc.y;

    doc.fontSize(14).fillColor('#333333').text('Investment Summary', rightX, y);

    y += 30;
    doc.fontSize(10).fillColor('#666666');

    // Show totals by frequency
    if (grouped.weekly.length > 0) {
      const weeklyWithVat = grouped.weekly.reduce((sum, s) => sum + lineIncVat(s), 0);
      doc
        .text('Weekly Total:', rightX, y)
        .text(this.formatCurrency(weeklyWithVat) + '/week', 490, y, { align: 'right' });
      y += 20;
    }

    if (grouped.monthly.length > 0) {
      const monthlyWithVat = grouped.monthly.reduce((sum, s) => sum + lineIncVat(s), 0);
      doc
        .text('Monthly Total:', rightX, y)
        .text(this.formatCurrency(monthlyWithVat) + '/month', 490, y, { align: 'right' });
      y += 20;
    }

    if (grouped.quarterly.length > 0) {
      const quarterlyWithVat = grouped.quarterly.reduce((sum, s) => sum + lineIncVat(s), 0);
      doc
        .text('Quarterly Total:', rightX, y)
        .text(this.formatCurrency(quarterlyWithVat) + '/quarter', 490, y, { align: 'right' });
      y += 20;
    }

    if (grouped.annually.length > 0) {
      const annualWithVat = grouped.annually.reduce((sum, s) => sum + lineIncVat(s), 0);
      doc
        .text('Annual Total:', rightX, y)
        .text(this.formatCurrency(annualWithVat) + '/year', 490, y, { align: 'right' });
      y += 20;
    }

    if (grouped.oneTime.length > 0) {
      const oneTimeWithVat = grouped.oneTime.reduce((sum, s) => sum + lineIncVat(s), 0);
      doc
        .text('One-Time Fees:', rightX, y)
        .text(this.formatCurrency(oneTimeWithVat), 490, y, { align: 'right' });
      y += 20;
    }

    // Divider
    y += 10;
    doc.moveTo(rightX, y).lineTo(550, y).strokeColor(primaryColor).lineWidth(1).stroke();

    // Grand Total
    y += 15;
    doc
      .fontSize(16)
      .fillColor(primaryColor)
      .text('Combined total:', rightX, y)
      .text(this.formatCurrency(proposal.total), 490, y, { align: 'right' });

    // Annual equivalent note
    const annualEquivalent =
      grouped.weekly.reduce(
        (sum, s) => sum + (s.displayPrice || s.unitPrice) * s.quantity * 52,
        0
      ) +
      grouped.monthly.reduce(
        (sum, s) => sum + (s.displayPrice || s.unitPrice) * s.quantity * 12,
        0
      ) +
      grouped.quarterly.reduce(
        (sum, s) => sum + (s.displayPrice || s.unitPrice) * s.quantity * 4,
        0
      ) +
      grouped.annually.reduce((sum, s) => sum + (s.displayPrice || s.unitPrice) * s.quantity, 0);

    if (annualEquivalent > 0) {
      y += 25;
      doc
        .fontSize(9)
        .fillColor('#888888')
        .text(`Annual equivalent: ${this.formatCurrency(annualEquivalent)}/year`, rightX, y);
    }

    // VAT breakdown
    y += 20;
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(`Includes VAT (20%): ${this.formatCurrency(proposal.vatAmount)}`, rightX, y);

    // Payment terms
    y += 30;
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text(`Payment Terms: ${proposal.paymentTerms}`, rightX, y);
  }

  /**
   * Draw terms and conditions
   */
  private static drawTerms(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    doc.fontSize(16).fillColor('#333333').text('Terms & Conditions', { align: 'center' });

    doc.moveDown(1);

    doc.fontSize(10).fillColor('#444444');

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

  private static drawSignedAcceptance(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    doc.fontSize(16).fillColor('#333333').text('Electronic Acceptance', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(11).fillColor('#444444');
    doc.text(`Signed by: ${proposal.acceptedBy || 'Client representative'}`);
    if (proposal.signatoryPosition) {
      doc.text(`Position: ${proposal.signatoryPosition}`);
    }
    if (proposal.acceptedAt) {
      doc.text(`Date: ${this.formatDate(proposal.acceptedAt)}`);
    }
    doc.moveDown(1);
    if (proposal.signature) {
      try {
        const base64 = proposal.signature.includes(',')
          ? proposal.signature.split(',')[1]
          : proposal.signature;
        doc.image(Buffer.from(base64, 'base64'), { fit: [200, 80] });
      } catch {
        doc.text('[Signature on file]');
      }
    }
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#666666').text(
      'This document was accepted using a simple electronic signature under UK law.',
      { align: 'center' }
    );
  }

  private static drawSignatureCertificate(doc: PDFDoc, proposal: ProposalData, sig: any) {
    doc.fontSize(16).fillColor('#333333').text('Signature Certificate', { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(10).fillColor('#444444');
    const rows: [string, string][] = [
      ['Proposal reference', proposal.reference],
      ['Signature ID', sig.id],
      ['Signer', sig.signedBy],
      ['Role', sig.signedByRole],
      ['Email', sig.signerEmail || '—'],
      ['Signed at (UTC)', new Date(sig.signedAt).toISOString()],
      ['IP address', sig.ipAddress || '—'],
      ['Location', sig.geoLocation || '—'],
      ['Signature type', sig.signatureType || 'SIMPLE_ELECTRONIC'],
      ['Agreement version', sig.agreementVersion || '—'],
      ['Document hash', sig.documentHash || '—'],
      ['Terms hash', sig.termsHash || '—'],
    ];
    rows.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(String(value), { width: 480 });
      doc.moveDown(0.3);
    });
    if (sig.consentText) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Consent statement');
      doc.font('Helvetica').text(sig.consentText, { width: 480 });
    }
  }

  /**
   * Draw acceptance page
   */
  private static drawAcceptance(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    doc.fontSize(16).fillColor('#333333').text('Acceptance', { align: 'center' });

    doc.moveDown(2);

    doc
      .fontSize(11)
      .fillColor('#444444')
      .text(
        'By signing below, you agree to the terms and conditions outlined in this proposal and authorize the commencement of services.',
        {
          align: 'justify',
        }
      );

    doc.moveDown(2);

    // Signature boxes
    const y = doc.y;

    doc.fontSize(10).fillColor('#333333').text('Client Signature:', 50, y).text('Date:', 350, y);

    // Signature lines
    doc
      .moveTo(50, y + 40)
      .lineTo(300, y + 40)
      .strokeColor('#999999')
      .lineWidth(0.5)
      .stroke();

    doc
      .moveTo(350, y + 40)
      .lineTo(550, y + 40)
      .strokeColor('#999999')
      .lineWidth(0.5)
      .stroke();

    doc
      .fontSize(9)
      .fillColor('#666666')
      .text('Signature', 50, y + 45)
      .text('DD/MM/YYYY', 350, y + 45);

    // Online acceptance note
    doc.moveDown(4);
    doc.fontSize(11).fillColor(primaryColor).text('Or accept online at:', { align: 'center' });

    const acceptanceUrl = `https://engage-frontend-0g6u.onrender.com/proposals/view/${proposal.id}`;
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text(acceptanceUrl, { align: 'center', link: acceptanceUrl });
  }

  /**
   * Format currency
   */
  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  /**
   * Format price with frequency label
   */
  private static formatPriceWithFrequency(price: number, frequency: string): string {
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
  private static formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}

export default PDFGenerator;
