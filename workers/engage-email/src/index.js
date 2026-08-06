/**
 * capstone-engage-email — outbound email worker for the Engage backend.
 *
 * The backend (services/sendgridTransport.ts) POSTs a REST-style payload to
 * /send with attachment `content` base64-encoded. The Email Sending BINDING
 * treats string content as RAW bytes (not base64), so it must be decoded to
 * a Uint8Array here — forwarding the string attaches the base64 text itself
 * and the received file cannot be opened (the 2026-07-19 proposal-PDF bug).
 */

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Backend sends REST-shaped addresses ({address, name}); binding wants {email, name}. */
function mapAddress(a) {
  if (!a) return undefined;
  if (typeof a === 'string') return a;
  return { email: a.address || a.email, name: a.name };
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const auth = request.headers.get('Authorization');
    if (!env.EMAIL_WORKER_SECRET || auth !== `Bearer ${env.EMAIL_WORKER_SECRET}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const { to, cc, from, reply_to: replyTo, subject, html, text, attachments } = body;
    if (!to || !subject) {
      return Response.json({ error: 'to and subject required' }, { status: 400 });
    }

    const message = {
      to,
      cc: cc || undefined,
      from: mapAddress(from),
      replyTo: mapAddress(replyTo),
      subject,
      html: html || undefined,
      text: text || undefined,
    };

    if (Array.isArray(attachments) && attachments.length) {
      try {
        message.attachments = attachments.map((a) => ({
          content: base64ToBytes(String(a.content || '')),
          filename: a.filename || 'attachment',
          type: a.type || 'application/octet-stream',
          disposition: a.disposition === 'inline' ? 'inline' : 'attachment',
          ...(a.content_id ? { contentId: a.content_id } : {}),
        }));
      } catch {
        return Response.json(
          { error: 'Invalid attachment content (expected base64)' },
          { status: 400 }
        );
      }
    }

    try {
      const result = await env.EMAIL.send(message);
      return Response.json({ ok: true, result: { messageId: result && result.messageId } });
    } catch (err) {
      console.error('Send failed:', err && err.message);
      return Response.json({ error: (err && err.message) || 'Send failed' }, { status: 502 });
    }
  },
};
