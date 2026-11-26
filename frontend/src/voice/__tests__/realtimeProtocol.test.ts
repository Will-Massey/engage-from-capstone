import { describe, expect, it } from 'vitest';
import {
  collectUsageEvent,
  downsample,
  functionResultEvents,
  pcm16Base64,
  pushToTalkReleaseEvents,
  sessionUsesRemoteMcp,
  textTurnEvents,
} from '../realtimeProtocol';

describe('voice protocol', () => {
  it('releases the mic by committing audio and asking for a reply', () => {
    expect(pushToTalkReleaseEvents()).toEqual([
      { type: 'input_audio_buffer.commit' },
      { type: 'response.create' },
    ]);
  });

  it('encodes pcm16 and downsamples toward 24 kHz', () => {
    const encoded = pcm16Base64(new Float32Array([0, 1, -1]));
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    const down = downsample(new Float32Array([0, 0, 1, 1]), 48000, 24000);
    expect(down.length).toBe(2);
  });

  it('never marks a session as remote MCP', () => {
    expect(sessionUsesRemoteMcp({ session: { tools: [{ type: 'function' }] } })).toBe(false);
    expect(sessionUsesRemoteMcp({ session: { tools: [{ type: 'mcp' }] } })).toBe(true);
  });

  it('sends a function result with the call id and collects only usage objects that arrived', () => {
    const events = functionResultEvents('call-1', { saved: false });
    expect(events[0]).toMatchObject({
      item: { type: 'function_call_output', call_id: 'call-1' },
    });
    expect(textTurnEvents('yes')[0]).toMatchObject({ item: { role: 'user' } });
    const kept = collectUsageEvent([], {
      type: 'response.done',
      usage: { billable_audio_seconds: 3 },
    });
    expect(kept).toEqual([{ usage: { billable_audio_seconds: 3 } }]);
    expect(collectUsageEvent(kept, { type: 'response.output_audio.delta' })).toEqual(kept);
  });
});
