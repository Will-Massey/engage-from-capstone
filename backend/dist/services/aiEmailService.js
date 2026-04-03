"use strict";
/**
 * AI Email Assistant Service
 * Generates context-aware email content using OpenAI
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiEmailService = exports.AIEmailService = void 0;
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
class AIEmailService {
    /**
     * Generate a follow-up email for a proposal
     */
    async generateFollowUpEmail(proposal, tone = 'professional') {
        const daysSince = proposal.sentAt
            ? Math.floor((Date.now() - proposal.sentAt.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        const prompt = `Generate a ${tone} follow-up email for an accountancy proposal.

Proposal details:
- Client: ${proposal.client.name}
- Services: ${proposal.services.map(s => s.name).join(', ')}
- Total: £${proposal.total}
- Days since sent: ${daysSince}

The email should:
- Be concise (max 150 words)
- Include a clear call-to-action
- Maintain a ${tone} tone
- Reference the specific services

Return only the email body text.`;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 300,
        });
        return response.choices[0].message.content || '';
    }
    /**
     * Suggest email subject lines
     */
    async suggestEmailSubject(proposal) {
        const prompt = `Generate 3 subject lines for a proposal follow-up email to ${proposal.client.name}.
The proposal includes: ${proposal.services.map(s => s.name).join(', ')}.

Return as a JSON array of strings.`;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.8,
        });
        const result = JSON.parse(response.choices[0].message.content || '{}');
        return result.subjects || [];
    }
    /**
     * Improve email content
     */
    async improveEmail(emailText, goal) {
        const goals = {
            professional: 'Make it more formal and business-appropriate',
            concise: 'Shorten it while keeping all key information',
            persuasive: 'Make it more compelling and action-oriented',
        };
        const prompt = `Improve the following email. ${goals[goal]}:

${emailText}

Return only the improved email text.`;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 500,
        });
        return response.choices[0].message.content || emailText;
    }
}
exports.AIEmailService = AIEmailService;
exports.aiEmailService = new AIEmailService();
exports.default = exports.aiEmailService;
//# sourceMappingURL=aiEmailService.js.map