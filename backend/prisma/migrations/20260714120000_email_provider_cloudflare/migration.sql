-- Platform email transport is Cloudflare (SendGrid fully removed); add the
-- honest provider value so email logs stop being labelled SENDGRID.
ALTER TYPE "EmailProvider" ADD VALUE IF NOT EXISTS 'CLOUDFLARE';
