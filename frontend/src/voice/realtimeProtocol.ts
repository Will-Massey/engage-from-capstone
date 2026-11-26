/** Helpers for the xAI realtime websocket. The API key never appears here. */

export function pcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, Math.round(clamped * 32767), true);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

export function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number
): Float32Array {
  if (outputRate >= inputRate) return input;
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j] ?? 0;
      count += 1;
    }
    output[i] = count ? sum / count : 0;
  }
  return output;
}

export function pushToTalkReleaseEvents(): Array<Record<string, string>> {
  return [{ type: 'input_audio_buffer.commit' }, { type: 'response.create' }];
}

export function textTurnEvents(text: string): Array<Record<string, unknown>> {
  return [
    {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    },
    { type: 'response.create' },
  ];
}

export function functionResultEvents(
  callId: string,
  output: unknown
): Array<Record<string, unknown>> {
  return [
    {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: JSON.stringify(output),
      },
    },
    { type: 'response.create' },
  ];
}

export function sessionUsesRemoteMcp(sessionUpdate: {
  session?: { tools?: Array<{ type?: string }> };
}): boolean {
  return (sessionUpdate.session?.tools ?? []).some((tool) => tool.type === 'mcp');
}

export function collectUsageEvent(
  events: unknown[],
  event: { type?: string; usage?: unknown }
): unknown[] {
  if (event.type === 'response.done' && event.usage && typeof event.usage === 'object') {
    return [...events, { usage: event.usage }];
  }
  return events;
}
