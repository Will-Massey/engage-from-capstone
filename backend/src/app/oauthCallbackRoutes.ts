import express from 'express';
import { handleOAuthProviderCallback } from '../handlers/oauthCallback.js';
import { handleXeroOAuthCallback } from '../handlers/xeroOAuthCallback.js';
import { handleQuickBooksOAuthCallback } from '../handlers/quickbooksOAuthCallback.js';

// OAuth callback — server-side code exchange (no auth code in frontend URL)
export function mountOauthCallbackRoutes(app: express.Express): void {
  app.get('/api/oauth/callback/outlook', (req, res) => {
    void handleOAuthProviderCallback(req, res, 'outlook');
  });
  app.get('/api/oauth/callback/microsoft365', (req, res) => {
    void handleOAuthProviderCallback(req, res, 'microsoft365');
  });
  app.get('/api/oauth/callback/gmail', (req, res) => {
    void handleOAuthProviderCallback(req, res, 'gmail');
  });
  app.get('/api/oauth/callback/xero', (req, res) => {
    void handleXeroOAuthCallback(req, res);
  });
  app.get('/api/oauth/callback/quickbooks', (req, res) => {
    void handleQuickBooksOAuthCallback(req, res);
  });
  app.get('/api/quickbooks/callback', (req, res) => {
    void handleQuickBooksOAuthCallback(req, res);
  });
}
