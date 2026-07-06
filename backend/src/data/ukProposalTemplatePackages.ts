/**
 * W3.2 — ICAEW/ACCA-aligned proposal template packages (100+ definitions).
 * Resolved to tenant ServiceTemplate IDs at seed time by service name.
 */
import { allServices } from './ukAccountancyServices.js';

export interface ProposalTemplatePackageDef {
  name: string;
  description: string;
  title: string;
  targetEntityType: string;
  targetIndustry?: string;
  serviceNames: string[];
  coverLetterSnippet?: string;
}

const ENTITY_TYPES = [
  'LIMITED_COMPANY',
  'LLP',
  'SOLE_TRADER',
  'PARTNERSHIP',
  'CHARITY',
  'NON_PROFIT',
] as const;

const INDUSTRIES = [
  'General',
  'Retail & e-commerce',
  'Construction',
  'Professional services',
  'Property & lettings',
  'Hospitality',
  'Technology',
  'Healthcare',
  'Manufacturing',
  'Agriculture',
] as const;

const TIERS = ['Micro', 'Small', 'Standard', 'Growth', 'Premium'] as const;

function servicesForEntity(entityType: string): typeof allServices {
  return allServices.filter(
    (s) =>
      !s.applicableEntityTypes?.length ||
      s.applicableEntityTypes.includes(entityType) ||
      s.applicableEntityTypes.includes('ALL')
  );
}

function entityLabel(entity: string): string {
  return entity
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Single-service templates per entity (where applicable). */
function buildSingleServiceTemplates(): ProposalTemplatePackageDef[] {
  const out: ProposalTemplatePackageDef[] = [];
  for (const entity of ENTITY_TYPES) {
    const applicable = servicesForEntity(entity);
    for (const svc of applicable) {
      out.push({
        name: `${svc.name} — ${entityLabel(entity)}`,
        description: `${svc.category} package for ${entityLabel(entity)} clients`,
        title: `${svc.name} proposal`,
        targetEntityType: entity,
        serviceNames: [svc.name],
        coverLetterSnippet: `We are pleased to set out our fees for ${svc.name.toLowerCase()} for your business.`,
      });
    }
  }
  return out;
}

/** Multi-service bundles by category + entity + tier. */
function buildBundleTemplates(): ProposalTemplatePackageDef[] {
  const out: ProposalTemplatePackageDef[] = [];
  const categories = ['COMPLIANCE', 'ADVISORY', 'MTD_ITSA', 'BOOKKEEPING', 'SPECIALIST'] as const;

  for (const entity of ENTITY_TYPES) {
    const applicable = servicesForEntity(entity);
    for (const category of categories) {
      const inCat = applicable.filter((s) => s.category === category);
      if (inCat.length < 2) continue;

      for (const tier of TIERS) {
        const count =
          tier === 'Micro'
            ? 2
            : tier === 'Small'
              ? 3
              : tier === 'Standard'
                ? 4
                : tier === 'Growth'
                  ? 5
                  : 6;
        const picked = inCat.slice(0, Math.min(count, inCat.length));
        out.push({
          name: `${entityLabel(entity)} ${category.replace('_', ' ')} — ${tier}`,
          description: `${tier}-tier ${category.toLowerCase()} bundle for ${entityLabel(entity)}`,
          title: `${tier} ${category.replace('_', ' ')} engagement`,
          targetEntityType: entity,
          serviceNames: picked.map((s) => s.name),
        });
      }
    }
  }
  return out;
}

/** Industry-flavoured compliance starters (ICAEW/ACCA practice norms). */
function buildIndustryTemplates(): ProposalTemplatePackageDef[] {
  const out: ProposalTemplatePackageDef[] = [];
  const complianceNames = allServices
    .filter((s) => s.category === 'COMPLIANCE')
    .map((s) => s.name)
    .slice(0, 4);

  if (!complianceNames.length) return out;

  for (const industry of INDUSTRIES) {
    for (const entity of ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP'] as const) {
      const applicable = servicesForEntity(entity).filter((s) => complianceNames.includes(s.name));
      if (!applicable.length) continue;
      out.push({
        name: `${industry} — ${entityLabel(entity)} compliance starter`,
        description: `ICAEW/ACCA-aligned starter pack for ${industry.toLowerCase()} ${entityLabel(entity)} clients`,
        title: `Compliance proposal — ${industry}`,
        targetEntityType: entity,
        targetIndustry: industry,
        serviceNames: applicable.slice(0, 3).map((s) => s.name),
        coverLetterSnippet: `This proposal is tailored for ${industry.toLowerCase()} businesses and reflects typical UK practice fee structures.`,
      });
    }
  }
  return out;
}

let _cache: ProposalTemplatePackageDef[] | null = null;

export function getUkProposalTemplatePackages(): ProposalTemplatePackageDef[] {
  if (_cache) return _cache;
  const combined = [
    ...buildSingleServiceTemplates(),
    ...buildBundleTemplates(),
    ...buildIndustryTemplates(),
  ];
  const seen = new Set<string>();
  _cache = combined.filter((t) => {
    const key = `${t.name}|${t.targetEntityType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return _cache;
}

export function getUkProposalTemplatePackageCount(): number {
  return getUkProposalTemplatePackages().length;
}
