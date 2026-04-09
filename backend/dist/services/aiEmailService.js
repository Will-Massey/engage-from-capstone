"use strict";
/**
 * AI Email Assistant Service
 * Generates context-aware email content using OpenAI
 *
 * NOTE: This service is currently disabled as OpenAI integration is not configured.
 * To enable, install the openai package and configure OPENAI_API_KEY environment variable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiEmailService = exports.AIEmailService = void 0;
class AIEmailService {
    throwNotImplemented() {
        throw new Error('AI email service not implemented');
    }
    /**
     * Generate a follow-up email for a proposal
     */
    async generateFollowUpEmail(_proposal, _tone = 'professional') {
        this.throwNotImplemented();
    }
    /**
     * Suggest email subject lines
     */
    async suggestEmailSubject(_proposal) {
        this.throwNotImplemented();
    }
    /**
     * Improve email content
     */
    async improveEmail(_emailText, _goal) {
        this.throwNotImplemented();
    }
}
exports.AIEmailService = AIEmailService;
exports.aiEmailService = new AIEmailService();
exports.default = exports.aiEmailService;
//# sourceMappingURL=aiEmailService.js.map