import PDFDocument from 'pdfkit';
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
  coverLetter?: string;
  terms?: string;
  notes?: string;
  createdAt: Date;
  client: {
    name: string;
    companyType: string;
    contactEmail: string;
    contactPhone?: string;
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
    total: number;
    frequency: string;
  }>;
  tenant: {
    name: string;
    logo?: string;
    settings: any;
  };
}

export class PDFGenerator {
  /**
   * Generate a professional proposal PDF
   */
  static async generateProposal(proposalId: string): Promise<Buffer> {
    // Fetch proposal with all related data
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        client: true,
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        services: true,
        tenant: true,
      },
    }) as unknown as ProposalData;

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
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Draw header section
   */
  private static drawHeader(doc: PDFDocument, proposal: ProposalData, primaryColor: string) {
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
      } catch (error) {
        // Fall back to text if logo fails
        doc.fontSize(24)
           .fillColor(primaryColor)
           .text(proposal.tenant.name, 50, 50);
      }
    } else {
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
  private static drawClientInfo(doc: PDFDocument, proposal: ProposalData) {
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
  private static drawCoverLetter(doc: PDFDocument, proposal: ProposalData) {
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
    doc.fontSize(10)
       .fillColor('#666666')
       .text('Please turn over for full Terms and Conditions of Engagement →', { align: 'center' });
  }

  /**
   * Draw services section
   */
  private static drawServices(doc: PDFDocument, proposal: ProposalData, primaryColor: string) {
    doc.fontSize(16)
       .fillColor('#333333')
       .text('Services', { align: 'center' });

    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const colWidths = { name: 250, qty: 60, price: 100, total: 100 };
    const colX = { name: 50, qty: 310, price: 380, total: 490 };

    doc.fontSize(10)
       .fillColor(primaryColor);

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

    proposal.services.forEach((service) => {
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      doc.text(service.name, colX.name, y, { width: colWidths.name });
      
      // Description if present
      if (service.description) {
        doc.fontSize(9)
           .fillColor('#666666')
           .text(service.description, colX.name, y + 15, {
             width: colWidths.name,
           });
        doc.fontSize(10)
           .fillColor('#333333');
      }

      doc.text(service.quantity.toString(), colX.qty, y)
         .text(this.formatCurrency(service.unitPrice), colX.price, y)
         .text(this.formatCurrency(service.total), colX.total, y);

      y += service.description ? 50 : 30;
    });

    // Bottom line
    doc.moveTo(50, y)
       .lineTo(550, y)
       .strokeColor('#CCCCCC')
       .lineWidth(0.5)
       .stroke();
  }

  /**
   * Draw pricing summary
   */
  private static drawPricing(doc: PDFDocument, proposal: ProposalData, primaryColor: string) {
    doc.moveDown(2);

    const rightX = 350;
    let y = doc.y;

    doc.fontSize(10)
       .fillColor('#666666');

    doc.text('Subtotal:', rightX, y)
       .text(this.formatCurrency(proposal.subtotal), 490, y, { align: 'right' });

    if (proposal.discountAmount > 0) {
      y += 20;
      doc.text('Discount:', rightX, y)
         .text(`-${this.formatCurrency(proposal.discountAmount)}`, 490, y, { align: 'right' });
    }

    y += 20;
    doc.text('VAT (20%):', rightX, y)
       .text(this.formatCurrency(proposal.vatAmount), 490, y, { align: 'right' });

    // Total line
    y += 30;
    doc.moveTo(rightX, y - 10)
       .lineTo(550, y - 10)
       .strokeColor(primaryColor)
       .lineWidth(1)
       .stroke();

    doc.fontSize(14)
       .fillColor(primaryColor)
       .text('Total:', rightX, y)
       .text(this.formatCurrency(proposal.total), 490, y, { align: 'right' });

    // Payment terms
    y += 40;
    doc.fontSize(10)
       .fillColor('#666666')
       .text(`Payment Terms: ${proposal.paymentTerms}`, rightX, y);
  }

  /**
   * Draw terms and conditions
   */
  private static drawTerms(doc: PDFDocument, proposal: ProposalData, primaryColor: string) {
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
  private static drawAcceptance(doc: PDFDocument, proposal: ProposalData, primaryColor: string) {
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

    doc.fontSize(10)
       .fillColor('#666666')
       .text(`https://proposal-platform.co.uk/p/${proposal.reference}`, { align: 'center', underline: true });

    // Footer
    doc.fontSize(8)
       .fillColor('#999999')
       .text(`This proposal was generated on ${this.formatDate(proposal.createdAt)} and is valid until ${this.formatDate(proposal.validUntil)}.`,
         50, 750, { align: 'center', width: 500 });
  }

  /**
   * Format currency
   */
  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
    }).format(amount);
  }

  /**
   * Format date
   */
  private static formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}

export default PDFGenerator;
