/** Client-side logo preparation — matches backend/pdf limits. */
export const TENANT_LOGO_MAX_BYTES = 512 * 1024;
export const TENANT_LOGO_MAX_DIMENSION_PX = 800;

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  return Math.ceil((base64.length * 3) / 4);
}

function scaleToFit(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const ratio = Math.min(max / width, max / height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image file.'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

function renderToJpegDataUrl(img: HTMLImageElement, maxDim: number, quality: number): string {
  const { width, height } = scaleToFit(img.naturalWidth, img.naturalHeight, maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Resize and compress an uploaded logo so proposal PDFs and emails stay reliable.
 * Returns a JPEG data URL under 512 KB.
 */
export async function prepareTenantLogoUpload(file: File): Promise<{
  dataUrl: string;
  resized: boolean;
  bytes: number;
}> {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new Error(
      'Please upload a PNG, JPEG, or WebP logo. SVG files are not supported for proposal PDFs.'
    );
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(originalDataUrl);
  const originalBytes = file.size;
  let maxDim = TENANT_LOGO_MAX_DIMENSION_PX;
  let quality = 0.9;
  let dataUrl = renderToJpegDataUrl(img, maxDim, quality);
  let bytes = estimateDataUrlBytes(dataUrl);

  while (bytes > TENANT_LOGO_MAX_BYTES && quality > 0.45) {
    quality -= 0.1;
    dataUrl = renderToJpegDataUrl(img, maxDim, quality);
    bytes = estimateDataUrlBytes(dataUrl);
  }

  while (bytes > TENANT_LOGO_MAX_BYTES && maxDim > 200) {
    maxDim = Math.round(maxDim * 0.75);
    quality = 0.85;
    dataUrl = renderToJpegDataUrl(img, maxDim, quality);
    bytes = estimateDataUrlBytes(dataUrl);
    while (bytes > TENANT_LOGO_MAX_BYTES && quality > 0.45) {
      quality -= 0.1;
      dataUrl = renderToJpegDataUrl(img, maxDim, quality);
      bytes = estimateDataUrlBytes(dataUrl);
    }
  }

  if (bytes > TENANT_LOGO_MAX_BYTES) {
    throw new Error(
      'That image is still too large after resizing. Please use a simpler logo under 512 KB.'
    );
  }

  const resized =
    originalBytes > TENANT_LOGO_MAX_BYTES ||
    img.naturalWidth > TENANT_LOGO_MAX_DIMENSION_PX ||
    img.naturalHeight > TENANT_LOGO_MAX_DIMENSION_PX ||
    file.type !== 'image/jpeg';

  return { dataUrl, resized, bytes };
}