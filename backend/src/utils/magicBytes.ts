const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const MIME_MAGIC: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [PNG_SIGNATURE],
  'image/webp': [Buffer.from('RIFF'), Buffer.from('WEBP')],
  'application/pdf': [Buffer.from('%PDF')],
};

export function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

export function bufferMatchesMime(buffer: Buffer, mimeType: string): boolean {
  const patterns = MIME_MAGIC[mimeType];
  if (!patterns) return false;

  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).equals(patterns[0]) &&
      buffer.subarray(8, 12).equals(patterns[1])
    );
  }

  const pattern = patterns[0];
  return buffer.length >= pattern.length && buffer.subarray(0, pattern.length).equals(pattern);
}