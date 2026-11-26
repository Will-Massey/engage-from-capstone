import { readFileSync } from 'fs';
import path from 'path';
import {
  capAllows,
  clientSecretRequestBody,
  dailyCapEnabled,
  dailyCapMinutes,
  estimateCostUsd,
  foldRealtimeUsage,
  redactSecret,
  resolveXaiApiKey,
  usdPerMinute,
} from '../xaiConfig.js';
import { forbiddenVoiceTools, voiceSessionTools, voiceSessionUpdate } from '../sessionTools.js';
import { groupUsage } from '../voiceUsage.js';

describe('xAI key and cap', () => {
  it('prefers ENGAGE_XAI_API_KEY and falls back to XAI_API_KEY', () => {
    expect(resolveXaiApiKey({ ENGAGE_XAI_API_KEY: ' engage ', XAI_API_KEY: 'other' })).toBe(
      'engage'
    );
    expect(resolveXaiApiKey({ XAI_API_KEY: ' other ' })).toBe('other');
    expect(resolveXaiApiKey({})).toBeNull();
  });

  it('caps a user at 60 minutes a day unless switched off', () => {
    expect(dailyCapEnabled({})).toBe(true);
    expect(dailyCapMinutes({})).toBe(60);
    expect(capAllows(60 * 60, {}).allowed).toBe(false);
    expect(capAllows(60 * 60 - 1, {}).allowed).toBe(true);
    expect(capAllows(60 * 60, { ENGAGE_VOICE_DAILY_CAP_ENABLED: 'false' }).allowed).toBe(true);
  });

  it('prices an estimate at 0.08 dollars a minute by default', () => {
    expect(usdPerMinute({})).toBe(0.08);
    expect(estimateCostUsd(60, usdPerMinute({}))).toBe(0.08);
    expect(estimateCostUsd(30, 0.08)).toBe(0.04);
  });

  it('redacts the key from provider errors', () => {
    expect(redactSecret('failed with secret-value in the body', 'secret-value')).not.toContain(
      'secret-value'
    );
  });
});

describe('realtime usage fields', () => {
  it('keeps billable seconds as a running total and only token fields that are present', () => {
    const folded = foldRealtimeUsage([
      { type: 'response.done', usage: { billable_audio_seconds: 5 } },
      { type: 'response.done', usage: { billable_audio_seconds: 12.5, input_tokens: 10 } },
    ]);
    expect(folded.billableAudioSeconds).toBe(12.5);
    expect(folded.inputTokens).toBe(10);
    expect(folded.outputTokens).toBeNull();
    expect(folded.totalTokens).toBeNull();
  });

  it('does not invent tokens when the event has none', () => {
    expect(foldRealtimeUsage([{ usage: { billable_audio_seconds: 1 } }])).toEqual({
      billableAudioSeconds: 1,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
  });
});

describe('voice session tools', () => {
  it('has no remote MCP tool and confirm takes only the pending change id', () => {
    const update = voiceSessionUpdate('Caroline Marks', 'Marks and Co');
    expect(JSON.stringify(update)).not.toMatch(/"type":"mcp"/);
    expect(forbiddenVoiceTools()).toEqual([]);
    const names = voiceSessionTools().map((tool) => String(tool.name));
    expect(names).toContain('engage_get_proposal_history');
    expect(names).toContain('propose_update_details');
    expect(names).not.toContain('engage_update_draft_details');
    for (const name of ['engage_get_proposal_history', 'propose_update_details']) {
      expect(name).not.toMatch(/send|email|sign|accept|decline|delete|archive|withdraw|paid/i);
    }
    const confirm = voiceSessionTools().find((tool) => tool.name === 'confirm_pending_change');
    expect(confirm?.parameters).toMatchObject({
      required: ['pending_change_id'],
      additionalProperties: false,
    });
    expect(Object.keys((confirm?.parameters as { properties: object }).properties)).toEqual([
      'pending_change_id',
    ]);
    expect(update.session.turn_detection).toBeNull();
    const body = clientSecretRequestBody();
    expect(body).toEqual({ expires_after: { seconds: 300 } });
    expect(JSON.stringify(body)).not.toMatch(/session|mcp/);
  });
});

describe('usage screen totals', () => {
  it('groups minutes and estimated cost by day and by month', () => {
    const grouped = groupUsage([
      {
        userId: 'u1',
        userName: 'Caroline Marks',
        startedAt: new Date('2026-11-26T10:00:00Z'),
        seconds: 120,
        estimatedCostUsd: 0.16,
      },
      {
        userId: 'u1',
        userName: 'Caroline Marks',
        startedAt: new Date('2026-11-26T12:00:00Z'),
        seconds: 60,
        estimatedCostUsd: 0.08,
      },
    ]);
    expect(grouped.totals).toMatchObject({ seconds: 180, estimatedCostUsd: 0.24 });
    expect(grouped.byDay).toHaveLength(1);
    expect(grouped.byDay[0].minutes).toBe(3);
    expect(grouped.byMonth).toHaveLength(1);
  });
});

describe('content security policy', () => {
  const root = path.resolve(__dirname, '../../../../../');
  const files = [
    'frontend/public/_headers',
    'workers/engage-proxy/src/index.js',
    'frontend/src/plugins/injectBuildTime.ts',
  ];

  it.each(files)('%s allows the xAI realtime endpoint', (file) => {
    const text = readFileSync(path.join(root, file), 'utf8');
    expect(text).toContain('https://api.x.ai');
    expect(text).toContain('wss://api.x.ai');
  });
});
