/**
 * In-app branding for the Engage proposal assistant.
 * No third-party model names are shown in the product UI.
 */
export const AI_COPILOT = {
  name: 'Clara',
  shortName: 'Clara',
  tagline: 'Your Engage proposal co-pilot',
  productLabel: 'Engage Assistant',
  welcomeMessage:
    "Hi, I'm Clara — your Engage proposal co-pilot. I can suggest services, draft cover letters, check proposal health, and help with follow-ups. Try a quick action below or ask me a short question.",
  unavailableMessage:
    "Clara isn't available right now. Your practice administrator can enable the assistant in server settings — quick navigation still works below.",
  offlineSubtitle: 'Temporarily unavailable',
  onlineSubtitle: 'Ready to help',
  askPlaceholder: 'Ask Clara anything about proposals…',
  draftWithLabel: 'Draft with Clara',
  reviseWithLabel: 'Revise with Clara',
  panelAriaLabel: 'Open Clara, your Engage proposal co-pilot',
} as const;

export function copilotUnavailableToast() {
  return `${AI_COPILOT.name} isn't available — ask your administrator to enable the Engage assistant.`;
}
