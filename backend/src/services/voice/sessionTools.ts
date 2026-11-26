import { XAI_VOICE_MODEL } from './xaiConfig.js';

const CONFIRM_ONLY = {
  type: 'object',
  properties: {
    pending_change_id: {
      type: 'string',
      description: 'The id of the change that was just read back.',
    },
  },
  required: ['pending_change_id'],
  additionalProperties: false,
} as const;

export const VOICE_TOOL_NAMES = [
  'engage_list_clients',
  'engage_list_proposals',
  'engage_get_proposal',
  'engage_get_proposal_history',
  'engage_list_services',
  'propose_create_draft',
  'propose_add_line',
  'propose_update_line',
  'propose_remove_line',
  'propose_update_notes',
  'propose_update_details',
  'propose_revert_to_draft',
  'propose_revision_draft',
  'confirm_pending_change',
  'cancel_pending_change',
] as const;

const HUMAN_ONLY = [
  'mark_lost',
  'rescind',
  'archive',
  'withdraw',
  'send',
  'esign',
  'e_sign',
  'accept',
  'decline',
  'mark_paid',
  'delete',
];

export function voiceInstructions(userName: string, practiceName: string): string {
  return [
    `You are the Engage assistant for ${userName} at ${practiceName}.`,
    'You help prepare proposal drafts. You speak in plain UK English.',
    'You never send a proposal, email a client, ask for a signature, accept, decline, archive, withdraw, mark lost, mark paid, or delete.',
    'You never remove a signature or change a signed, accepted, archived, lost, declined, or withdrawn proposal.',
    'You may prepare a new draft copied from one of those. The original stays as it is.',
    'You can read a proposal history: status, views, who signed and when, and earlier drafts. You never repeat a signature image.',
    'On a draft, you may prepare a change to the title, the valid until date, or the payment terms. That still waits for a yes.',
    'When you want to change something, call the matching propose function. That does not save.',
    'Then read the change back in one clear sentence, including the before and after, and wait.',
    'Call confirm_pending_change only after the person has clearly said yes to that exact read-back.',
    'Pass only the pending change id. If they say no, call cancel_pending_change with that id, or wait for the button.',
    'If you are not sure they said yes, do not confirm.',
    'Fees and VAT must come from a tool result or from a number the person just gave you. Do not invent them.',
  ].join(' ');
}

function fn(name: string, description: string, parameters: Record<string, unknown>) {
  return { type: 'function' as const, name, description, parameters };
}

export function voiceSessionTools(): Array<Record<string, unknown>> {
  return [
    fn('engage_list_clients', 'List clients in this practice.', {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    }),
    fn('engage_list_proposals', 'List proposals. This does not change anything.', {
      type: 'object',
      properties: {
        status: { type: 'string' },
        query: { type: 'string' },
      },
      additionalProperties: false,
    }),
    fn('engage_get_proposal', 'Read one proposal.', {
      type: 'object',
      properties: { proposal_id: { type: 'string' } },
      required: ['proposal_id'],
      additionalProperties: false,
    }),
    fn(
      'engage_get_proposal_history',
      'Read the history of one proposal: status, sent and viewed times, view count, signer names and dates, revision drafts, and recent activity. No signature image.',
      {
        type: 'object',
        properties: { proposal_id: { type: 'string' } },
        required: ['proposal_id'],
        additionalProperties: false,
      }
    ),
    fn('engage_list_services', 'List catalogue services and prices.', {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false,
    }),
    fn('propose_create_draft', 'Prepare a new draft. Does not save until it is confirmed.', {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        title: { type: 'string' },
        lines: { type: 'array' },
      },
      required: ['client_id', 'lines'],
      additionalProperties: false,
    }),
    fn('propose_add_line', 'Prepare adding a line to a draft. Does not save until confirmed.', {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        service_id: { type: 'string' },
        display_price_gbp: { type: 'number' },
        billing_frequency: { type: 'string' },
        quantity: { type: 'number' },
        hourly_billing_mode: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['proposal_id', 'service_id'],
      additionalProperties: false,
    }),
    fn('propose_update_line', 'Prepare a line change on a draft. Does not save until confirmed.', {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        line_id: { type: 'string' },
        display_price_gbp: { type: 'number' },
        billing_frequency: { type: 'string' },
        quantity: { type: 'number' },
        hourly_billing_mode: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['proposal_id', 'line_id'],
      additionalProperties: false,
    }),
    fn(
      'propose_remove_line',
      'Prepare removing a line from a draft. Does not save until confirmed.',
      {
        type: 'object',
        properties: {
          proposal_id: { type: 'string' },
          line_id: { type: 'string' },
        },
        required: ['proposal_id', 'line_id'],
        additionalProperties: false,
      }
    ),
    fn('propose_update_notes', 'Prepare new notes on a draft. Does not save until confirmed.', {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['proposal_id', 'notes'],
      additionalProperties: false,
    }),
    fn(
      'propose_update_details',
      'Prepare a change to the title, valid until date, or payment terms on a draft. Does not save until confirmed.',
      {
        type: 'object',
        properties: {
          proposal_id: { type: 'string' },
          title: { type: 'string' },
          valid_until: { type: 'string' },
          payment_terms: { type: 'string' },
        },
        required: ['proposal_id'],
        additionalProperties: false,
      }
    ),
    fn(
      'propose_revert_to_draft',
      'Prepare returning a sent or viewed proposal to draft. The client link stops if this is confirmed. Does not save until confirmed.',
      {
        type: 'object',
        properties: { proposal_id: { type: 'string' } },
        required: ['proposal_id'],
        additionalProperties: false,
      }
    ),
    fn(
      'propose_revision_draft',
      'Prepare a new draft copied from a proposal. The original is not changed. Does not save until confirmed.',
      {
        type: 'object',
        properties: { proposal_id: { type: 'string' } },
        required: ['proposal_id'],
        additionalProperties: false,
      }
    ),
    fn(
      'confirm_pending_change',
      'Save a change the person has clearly agreed to. Call this only after they said yes to that read-back. Pass only the pending change id.',
      CONFIRM_ONLY
    ),
    fn(
      'cancel_pending_change',
      'Drop a change the person does not want. Pass only the pending change id.',
      CONFIRM_ONLY
    ),
  ];
}

export function voiceSessionUpdate(userName: string, practiceName: string) {
  const tools = voiceSessionTools();
  for (const tool of tools) {
    if (tool.type === 'mcp') {
      throw new Error('Voice sessions must not use remote MCP.');
    }
  }
  return {
    type: 'session.update' as const,
    session: {
      voice: 'eve',
      model: XAI_VOICE_MODEL,
      instructions: voiceInstructions(userName, practiceName),
      turn_detection: null,
      tools,
    },
  };
}

export function forbiddenVoiceTools(): string[] {
  const names = voiceSessionTools().map((tool) => String(tool.name));
  return HUMAN_ONLY.filter((word) => names.some((name) => name.includes(word)));
}
