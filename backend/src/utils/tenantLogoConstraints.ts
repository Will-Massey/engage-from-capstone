/** Limits for tenant logos — keeps proposal PDFs and emails reliable. */
export const TENANT_LOGO_MAX_BYTES = 512 * 1024;
export const TENANT_LOGO_MAX_DIMENSION_PX = 800;
export const TENANT_LOGO_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4);
}

export function parseLogoDataUrl(logo: string): { mime: string; base64: string } | null {
  const match = logo.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2] };
}

export type TenantLogoValidation = { ok: true; logo: string } | { ok: false; message: string };

/** Validate logo before persisting on tenant settings. */
export function validateTenantLogoForStorage(
  logo: string | undefined | null
): TenantLogoValidation {
  if (logo === undefined || logo === null || logo.trim() === '') {
    return { ok: true, logo: '' };
  }

  const trimmed = logo.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { ok: true, logo: trimmed };
  }

  const parsed = parseLogoDataUrl(trimmed);
  if (!parsed) {
    return {
      ok: false,
      message: 'Logo must be a PNG, JPEG, or WebP image under 512 KB, or a public image URL.',
    };
  }

  if (!TENANT_LOGO_ALLOWED_MIME.has(parsed.mime)) {
    return {
      ok: false,
      message:
        'Logo must be PNG, JPEG, or WebP. SVG and other formats are not supported for proposal PDFs.',
    };
  }

  const bytes = estimateDataUrlBytes(trimmed);
  if (bytes > TENANT_LOGO_MAX_BYTES) {
    return {
      ok: false,
      message: `Logo is too large (${Math.round(bytes / 1024)} KB). Please use an image under 512 KB.`,
    };
  }

  return { ok: true, logo: trimmed };
}
