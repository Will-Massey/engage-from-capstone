import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import net from 'net';
import dns from 'dns/promises';
import { DEFAULT_VAT_RATE, vatAmountFor } from '@uk-proposal-platform/shared';

// pdfkit types export the constructor as a value, not a type
// Use any for the document type to avoid TS2749 errors
type PDFDoc = any;
import { prisma } from '../config/database.js';
import { getFrontendUrl } from '../config/urls.js';
import { formatGeoLocationDisplay } from '../utils/signatureAudit.js';
import { parseProposalCustomFields } from '../utils/proposalCustomFields.js';
import { parseClientAddress, preparedForLines, senderPosition } from '../utils/proposalDisplay.js';
import { TENANT_LOGO_MAX_BYTES } from '../utils/tenantLogoConstraints.js';

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
  proposalSummary?: string;
  terms?: string;
  notes?: string;
  createdAt: Date;
  acceptedAt?: Date;
  acceptedBy?: string;
  signatoryPosition?: string;
  signature?: string;
  customFields?: string;
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
    jobTitle?: string | null;
    role?: string | null;
  };
  services: Array<{
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    displayPrice?: number;
    billingFrequency?: string;
    total: number;
    /** Net line total after discount (present on all DB rows) */
    lineTotal?: number;
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

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;

// Remote logo fetch hardening (SSRF): tenant-supplied logo URLs are fetched
// server-side, so an attacker could point them at internal/metadata endpoints.
const REMOTE_FETCH_TIMEOUT_MS = 5000;

/** True if an IPv4/IPv6 literal falls in a private, loopback, link-local, or reserved range. */
export function isPrivateIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = p;
    if (a === 0) return true; // 0.0.0.0/8 (incl. 0.0.0.0)
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (type === 6) {
    const v6 = ip.toLowerCase().split('%')[0];
    if (v6 === '::1' || v6 === '::') return true; // loopback / unspecified
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // fc00::/7 unique-local
    if (v6.startsWith('fe80')) return true; // link-local
    return false;
  }
  // Not a recognisable IP literal — treat as unsafe.
  return true;
}

/**
 * Structural + DNS safety check for a remote URL before we fetch it server-side.
 * Only http/https, and every resolved address must be publicly routable.
 * (There is a residual DNS-rebinding TOCTOU window; acceptable for a logo fetch.)
 */
export async function isSafeRemoteUrl(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname || hostname.toLowerCase() === 'localhost') return false;

  // Literal IP host — check directly; otherwise resolve every A/AAAA record.
  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) return false;
    return records.every((r) => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}

/**
 * Fetch a remote image with SSRF guard, size cap, and timeout. Returns null on
 * any failure (unsafe host, oversize, timeout, non-OK response).
 */
async function fetchRemoteImageSafely(rawUrl: string, maxBytes: number): Promise<Buffer | null> {
  if (!(await isSafeRemoteUrl(rawUrl))) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(rawUrl, { signal: controller.signal, redirect: 'error' });
    if (!res.ok) return null;

    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0 || buffer.length > maxBytes) return null;
    return buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
  private static pageBackgroundBuffer: Buffer | null | undefined;

  private static loadPageBackgroundBuffer(): Buffer | null {
    if (this.pageBackgroundBuffer !== undefined) {
      return this.pageBackgroundBuffer;
    }

    const candidates = [
      path.join(__dirname, '../assets/pdf-page-background.jpg'),
      path.join(process.cwd(), 'dist/assets/pdf-page-background.jpg'),
      path.join(process.cwd(), 'src/assets/pdf-page-background.jpg'),
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          this.pageBackgroundBuffer = fs.readFileSync(candidate);
          return this.pageBackgroundBuffer;
        }
      } catch {
        // try next path
      }
    }

    this.pageBackgroundBuffer = null;
    return null;
  }

  /** Full-page Engage background artwork — drawn behind all content */
  private static drawPageBackground(doc: PDFDoc, backgroundBuffer: Buffer | null) {
    if (!backgroundBuffer) return;
    try {
      doc.save();
      doc.image(backgroundBuffer, 0, 0, {
        width: PDF_PAGE_WIDTH,
        height: PDF_PAGE_HEIGHT,
      });
      doc.restore();
    } catch {
      // continue without background if image fails
    }
  }

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
          select: { firstName: true, lastName: true, email: true, jobTitle: true, role: true },
        },
        services: true,
        tenant: true,
        signatures: {
          orderBy: { signedAt: 'asc' as const },
        },
      },
    })) as unknown as ProposalData & { signatures?: any[] };

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const logoBuffer = await this.loadTenantLogoBuffer(proposal.tenant);
    return this.createPDF(proposal, logoBuffer);
  }

  /** Resolve logo from tenant.logo column or settings.branding.logo */
  private static resolveTenantLogoUrl(tenant: ProposalData['tenant']): string | undefined {
    if (tenant.logo?.trim()) return tenant.logo.trim();
    const settings =
      typeof tenant.settings === 'string'
        ? (() => {
            try {
              return JSON.parse(tenant.settings) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : (tenant.settings as Record<string, unknown> | undefined) || {};
    const branding = settings.branding as { logo?: string } | undefined;
    return branding?.logo?.trim() || undefined;
  }

  private static async loadTenantLogoBuffer(
    tenant: ProposalData['tenant']
  ): Promise<Buffer | null> {
    const logoData = this.resolveTenantLogoUrl(tenant);
    if (!logoData) return null;

    try {
      let buffer: Buffer | null = null;
      if (logoData.startsWith('data:image')) {
        const base64Data = logoData.split(',')[1];
        buffer = base64Data ? Buffer.from(base64Data, 'base64') : null;
      } else if (logoData.startsWith('http://') || logoData.startsWith('https://')) {
        // SSRF guard: allowlist public hosts only, cap size + timeout.
        buffer = await fetchRemoteImageSafely(logoData, TENANT_LOGO_MAX_BYTES);
      } else {
        buffer = Buffer.from(logoData, 'base64');
      }
      if (!buffer || buffer.length === 0 || buffer.length > TENANT_LOGO_MAX_BYTES) {
        return null;
      }
      return buffer;
    } catch {
      return null;
    }
  }

  /**
   * Generate a standalone signature certificate PDF (forensic audit export).
   */
  static async generateSignatureCertificate(
    proposalId: string,
    signatureId: string
  ): Promise<Buffer> {
    const proposal = await prisma.proposal.findUnique({
      where: { id: proposalId },
      select: { id: true, reference: true },
    });

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const sig = await prisma.proposalSignature.findFirst({
      where: { id: signatureId, proposalId },
    });

    if (!sig) {
      throw new Error('Signature not found');
    }

    return this.createCertificateOnlyPDF(proposal, sig);
  }

  /**
   * Create a single-page signature certificate PDF.
   */
  private static createCertificateOnlyPDF(
    proposal: { reference: string },
    sig: {
      id: string;
      signedBy: string;
      signedByRole: string;
      signerEmail: string | null;
      signedAt: Date;
      ipAddress: string | null;
      geoLocation: string | null;
      signatureType: string;
      agreementVersion: string;
      documentHash: string | null;
      termsHash: string | null;
      consentText: string | null;
    }
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageBackgroundBuffer = this.loadPageBackgroundBuffer();
        const applyPageBackground = () => this.drawPageBackground(doc, pageBackgroundBuffer);
        doc.on('pageAdded', applyPageBackground);
        applyPageBackground();

        this.drawSignatureCertificate(doc, proposal, sig);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create the PDF document
   */
  private static createPDF(proposal: ProposalData, logoBuffer: Buffer | null): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Primary and secondary colors — tenant branding
        const settings =
          typeof proposal.tenant.settings === 'string'
            ? (() => {
                try {
                  return JSON.parse(proposal.tenant.settings) as Record<string, unknown>;
                } catch {
                  return {};
                }
              })()
            : (proposal.tenant.settings as Record<string, unknown> | undefined) || {};
        const branding = settings.branding as { primaryColor?: string } | undefined;
        const primaryColor =
          (proposal.tenant as { primaryColor?: string }).primaryColor ||
          branding?.primaryColor ||
          (settings.primaryColor as string | undefined) ||
          '#0ea5e9';
        const secondaryColor = '#666666';
        const pageBackgroundBuffer = this.loadPageBackgroundBuffer();
        const applyPageBackground = () => this.drawPageBackground(doc, pageBackgroundBuffer);

        doc.on('pageAdded', applyPageBackground);
        applyPageBackground();

        // ========== PAGE 1: HEADER + PARTIES ==========
        this.drawHeader(doc, proposal, primaryColor, logoBuffer);
        this.drawClientInfo(doc, proposal, primaryColor);

        // ========== COVER LETTER (includes legacy proposalSummary when present) ==========
        doc.addPage();
        this.drawCoverLetter(doc, proposal, primaryColor);

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
          const sigs = (proposal as any).signatures || [];
          for (const sig of sigs) {
            doc.addPage();
            this.drawSignatureCertificate(doc, proposal, sig);
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
  private static drawHeader(
    doc: PDFDoc,
    proposal: ProposalData,
    primaryColor: string,
    logoBuffer: Buffer | null
  ) {
    let logoBottomY = 50;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, 40, { width: 120 });
        logoBottomY = 160;
      } catch {
        doc.fontSize(24).fillColor(primaryColor).text(proposal.tenant.name, 50, 50);
        logoBottomY = 80;
      }
    } else {
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

    const dividerY = logoBottomY + 12;
    doc.moveTo(50, dividerY).lineTo(550, dividerY).strokeColor(primaryColor).lineWidth(2).stroke();

    const titleY = dividerY + 28;
    doc.fontSize(20).fillColor('#333333').text(proposal.title, 50, titleY, {
      align: 'center',
      width: 500,
    });
    doc.y = titleY + 36;
  }

  /**
   * Draw client information
   */
  private static drawClientInfo(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    const startY = doc.y + 16;
    const leftX = 50;
    const rightX = 320;
    const colWidth = 240;

    doc
      .fontSize(10)
      .fillColor(primaryColor)
      .text('PREPARED FOR', leftX, startY, { width: colWidth });
    doc
      .fontSize(10)
      .fillColor(primaryColor)
      .text('PREPARED BY', rightX, startY, { width: colWidth });

    doc.fontSize(11).fillColor('#444444');
    let leftY = startY + 18;
    let rightY = startY + 18;

    for (const line of preparedForLines(proposal.client)) {
      doc.fontSize(11).fillColor('#333333').text(line, leftX, leftY, { width: colWidth });
      leftY += 14;
    }

    const addr = parseClientAddress(proposal.client.address);
    if (addr?.line1) {
      doc.fontSize(10).fillColor('#666666').text(addr.line1, leftX, leftY, { width: colWidth });
      leftY += 13;
    }
    if (addr?.line2) {
      doc.text(addr.line2, leftX, leftY, { width: colWidth });
      leftY += 13;
    }
    if (addr?.city || addr?.postcode) {
      doc.text([addr.city, addr.postcode].filter(Boolean).join(', '), leftX, leftY, {
        width: colWidth,
      });
      leftY += 13;
    }

    if (proposal.client.contactEmail) {
      doc.text(proposal.client.contactEmail, leftX, leftY, { width: colWidth });
      leftY += 13;
    }
    if (proposal.client.contactPhone) {
      doc.text(proposal.client.contactPhone, leftX, leftY, { width: colWidth });
      leftY += 13;
    }

    const senderName = `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`.trim();
    const position = senderPosition(proposal.createdBy);
    doc.fontSize(11).fillColor('#333333').text(senderName, rightX, rightY, { width: colWidth });
    rightY += 14;
    if (position) {
      doc.fontSize(10).fillColor('#666666').text(position, rightX, rightY, { width: colWidth });
      rightY += 13;
    }
    doc.text(proposal.createdBy.email, rightX, rightY, { width: colWidth });
    rightY += 13;
    doc.fontSize(10).fillColor(primaryColor).text(proposal.tenant.name, rightX, rightY, {
      width: colWidth,
    });
    rightY += 13;

    doc.y = Math.max(leftY, rightY) + 12;
  }

  /** Combined cover letter body — merges legacy proposalSummary into the letter */
  private static resolveCoverLetterBody(proposal: ProposalData): string {
    const letter = proposal.coverLetter?.trim() || '';
    const summary = proposal.proposalSummary?.trim() || '';
    if (letter && summary) {
      return `${letter}\n\n${summary}`;
    }
    return letter || summary;
  }

  /**
   * Draw cover letter / Introduction
   */
  private static drawCoverLetter(doc: PDFDoc, proposal: ProposalData, _primaryColor: string) {
    const body = this.resolveCoverLetterBody(proposal);

    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#444444');

    // Default introduction template if no custom cover letter
    if (!body || body.length < 50) {
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
${senderPosition(proposal.createdBy) ? `${senderPosition(proposal.createdBy)}, ` : ''}${proposal.tenant.name}`;

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
      const paragraphs = body.split('\n\n');
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

    doc.moveDown(2);
    doc
      .fontSize(10)
      .fillColor('#666666')
      .text('Please turn over for full Terms and Conditions of Engagement.', { align: 'center' });
  }

  /**
   * Draw services section as a flat list
   */
  private static drawServices(doc: PDFDoc, proposal: ProposalData, primaryColor: string) {
    doc.fontSize(16).fillColor('#333333').text('Services', { align: 'center' });

    doc.moveDown(1);

    if (!proposal.services || proposal.services.length === 0) return;

    const tableTop = doc.y;
    const colX = { name: 50, qty: 310, price: 380, total: 490 };

    doc.fontSize(9).fillColor('#888888');

    doc
      .text('Service', colX.name, tableTop)
      .text('Qty', colX.qty, tableTop)
      .text('Price', colX.price, tableTop)
      .text('Total', colX.total, tableTop);

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .strokeColor('#CCCCCC')
      .lineWidth(0.5)
      .stroke();

    doc.fontSize(10).fillColor('#333333');

    let y = tableTop + 25;

    proposal.services.forEach((service) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      const displayPrice = service.displayPrice || service.unitPrice;
      const billingFreq = service.billingFrequency || service.frequency;
      const priceLabel = this.formatPriceWithFrequency(displayPrice, billingFreq);
      // Stored lineTotal is net-of-discount; only recompute for legacy rows without it
      const lineTotal =
        typeof service.lineTotal === 'number'
          ? service.lineTotal
          : (service.displayPrice || service.unitPrice) * service.quantity;

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
      const stored = s.billingFrequency || s.frequency;
      if (stored) return stored;

      const name = s.name.toLowerCase();
      // One-time / project services (legacy rows without billingFrequency)
      if (
        name.includes('prior year') ||
        name.includes('prior accounts') ||
        name.includes('company formation') ||
        name.includes('xero setup') ||
        name.includes('dext setup') ||
        name.includes('dext subscription & setup') ||
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
      // Annual services — year-end compliance billed annually (not monthly retainer)
      if (
        name.includes('dormant company accounts') ||
        name.includes('dormant accounts') ||
        name.includes('self assessment') ||
        name.includes('self-assessment') ||
        name.includes('p11d') ||
        name.includes('audit services')
      ) {
        return 'ANNUALLY';
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
      return 'MONTHLY';
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
      const net =
        typeof s.lineTotal === 'number'
          ? s.lineTotal
          : (s.displayPrice || s.unitPrice || 0) * (s.quantity || 1);
      return net + vatAmountFor(net, s.vatRate ?? DEFAULT_VAT_RATE);
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
    doc.moveDown(1.5);

    const customFields = parseProposalCustomFields(proposal.customFields);
    if (customFields.selectedTierLabel) {
      doc
        .fontSize(11)
        .fillColor(primaryColor)
        .text(`Selected package: ${customFields.selectedTierLabel}`, { align: 'center' });
      doc.moveDown(1);
    }

    const signatures: Array<{
      signedBy: string;
      signedByRole: string;
      signedAt: Date | string;
      signatureData?: string;
      signerEmail?: string | null;
    }> = (proposal as any).signatures?.length
      ? (proposal as any).signatures
      : [
          {
            signedBy: proposal.acceptedBy || 'Client representative',
            signedByRole: proposal.signatoryPosition || '',
            signedAt: proposal.acceptedAt || new Date(),
            signatureData: proposal.signature,
          },
        ];

    signatures.forEach((sig, index) => {
      if (index > 0) doc.moveDown(1.5);
      doc
        .fontSize(12)
        .fillColor('#333333')
        .text(`Signatory ${index + 1}`, { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#444444');
      doc.text(`Signed by: ${sig.signedBy}`);
      if (sig.signedByRole) {
        doc.text(`Position: ${sig.signedByRole}`);
      }
      if (sig.signerEmail) {
        doc.text(`Email: ${sig.signerEmail}`);
      }
      doc.text(`Date: ${this.formatDate(new Date(sig.signedAt))}`);
      doc.moveDown(0.5);
      const sigData = sig.signatureData;
      if (sigData) {
        try {
          const base64 = sigData.includes(',') ? sigData.split(',')[1] : sigData;
          doc.image(Buffer.from(base64, 'base64'), { fit: [200, 80] });
        } catch {
          doc.text('[Signature on file]');
        }
      }
    });

    doc.moveDown(2);
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text('This document was accepted using simple electronic signature(s) under UK law.', {
        align: 'center',
      });
  }

  private static drawSignatureCertificate(
    doc: PDFDoc,
    proposal: Pick<ProposalData, 'reference'>,
    sig: any
  ) {
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
      ['Location', formatGeoLocationDisplay(sig.geoLocation)],
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

    const acceptanceUrl = `${getFrontendUrl()}/proposals/view/${proposal.id}`;
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
