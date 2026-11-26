import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import {
  collectUsageEvent,
  downsample,
  functionResultEvents,
  pcm16Base64,
  pushToTalkReleaseEvents,
  sessionUsesRemoteMcp,
  textTurnEvents,
} from '../../voice/realtimeProtocol';

type PendingCard = {
  id: string;
  summary: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  status: string;
  expires_at: string;
  saved?: boolean;
};

type SessionPayload = {
  usageId: string;
  clientSecret: string;
  websocketUrl: string;
  sessionUpdate: { session?: { tools?: Array<{ type?: string }> } };
};

function linesOf(value: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!value) return [];
  return Object.entries(value).map(([key, item]) => [
    key.split('_').join(' '),
    typeof item === 'string' ? item : JSON.stringify(item),
  ]);
}

export default function Assistant() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [status, setStatus] = useState('Off');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [holding, setHolding] = useState(false);
  const [pending, setPending] = useState<PendingCard[]>([]);
  const [text, setText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const usageIdRef = useRef<string | null>(null);
  const usageEvents = useRef<unknown[]>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const playAt = useRef(0);
  const captureRef = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    processor: ScriptProcessorNode;
  } | null>(null);
  const heartbeatRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<{ enabled: boolean }>('/voice/access')
      .then((res) => {
        if (!cancelled) setEnabled(Boolean(res.data?.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      apiClient
        .get<PendingCard[]>('/voice/pending')
        .then((res) => {
          if (!cancelled) setPending(res.data ?? []);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    return () => {
      void hangUp();
    };
    // Unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playPcm(b64: string) {
    const ctx = audioRef.current;
    if (!ctx || !b64) return;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const view = new DataView(bytes.buffer);
    const samples = Math.floor(bytes.length / 2);
    const buffer = ctx.createBuffer(1, samples, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const start = Math.max(ctx.currentTime, playAt.current);
    source.start(start);
    playAt.current = start + buffer.duration;
  }

  async function onServerEvent(event: {
    type?: string;
    delta?: string;
    transcript?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    usage?: unknown;
  }) {
    usageEvents.current = collectUsageEvent(usageEvents.current, event);
    if (event.type === 'response.output_audio.delta' && event.delta) playPcm(event.delta);
    if (event.type === 'response.output_audio_transcript.delta' && event.delta) {
      setTranscript((current) => current + event.delta);
    }
    if (event.type === 'response.output_audio_transcript.done') {
      setTranscript((current) => `${current}\n`);
    }
    if (event.type === 'response.function_call_arguments.done' && event.name && event.call_id) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(event.arguments || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      let output: unknown;
      try {
        const res = await apiClient.post<PendingCard & { saved?: boolean }>('/voice/tools', {
          name: event.name,
          arguments: args,
        });
        output = res.data;
        if (res.data && res.data.summary && res.data.saved === false) {
          setPending((list) => [
            res.data as PendingCard,
            ...list.filter((item) => item.id !== res.data.id),
          ]);
        }
        if (res.data?.saved && res.data.id) {
          setPending((list) => list.filter((item) => item.id !== res.data.id));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'The change was not saved.';
        output = { error: message };
        setError(message);
      }
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        for (const message of functionResultEvents(event.call_id, output)) {
          socket.send(JSON.stringify(message));
        }
      }
    }
  }

  async function connect() {
    setError('');
    setStatus('Connecting');
    const res = await apiClient.post<SessionPayload>('/voice/session', {});
    const session = res.data;
    if (!session?.clientSecret || !session.websocketUrl) {
      throw new Error('The server did not start a voice session.');
    }
    if (sessionUsesRemoteMcp(session.sessionUpdate)) {
      throw new Error('This session was refused because it asked for a remote tool server.');
    }
    usageIdRef.current = session.usageId;
    usageEvents.current = [];
    const player = new AudioContext();
    audioRef.current = player;
    playAt.current = 0;
    const socket = new WebSocket(session.websocketUrl, [
      `xai-client-secret.${session.clientSecret}`,
    ]);
    socketRef.current = socket;
    socket.onopen = () => {
      socket.send(JSON.stringify(session.sessionUpdate));
      setStatus('Ready. Hold the button to talk.');
    };
    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return;
      try {
        void onServerEvent(JSON.parse(message.data));
      } catch {
        setError('A voice message could not be read.');
      }
    };
    socket.onerror = () => setError('The voice connection failed.');
    socket.onclose = () => {
      setStatus('Off');
      setHolding(false);
    };
    if (heartbeatRef.current != null) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      const id = usageIdRef.current;
      if (!id || socket.readyState !== WebSocket.OPEN) return;
      apiClient.post(`/voice/session/${id}/heartbeat`, {}).catch((err: { message?: string }) => {
        setError(err?.message || 'The daily voice limit has been reached.');
        void hangUp();
      });
    }, 30000);
  }

  async function hangUp() {
    if (heartbeatRef.current != null) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    stopCapture();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    const id = usageIdRef.current;
    usageIdRef.current = null;
    if (id) {
      await apiClient
        .post(`/voice/session/${id}/close`, { usageEvents: usageEvents.current })
        .catch(() => undefined);
    }
    usageEvents.current = [];
    await audioRef.current?.close().catch(() => undefined);
    audioRef.current = null;
    setStatus('Off');
    setHolding(false);
  }

  function stopCapture() {
    const capture = captureRef.current;
    captureRef.current = null;
    if (!capture) return;
    capture.processor.disconnect();
    capture.stream.getTracks().forEach((track) => track.stop());
    void capture.ctx.close();
  }

  async function startTalking() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || holding) return;
    setHolding(true);
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      processor.onaudioprocess = (event) => {
        const live = socketRef.current;
        if (!live || live.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        const samples = downsample(input, ctx.sampleRate, 24000);
        live.send(
          JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm16Base64(samples) })
        );
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
      captureRef.current = { ctx, stream, processor };
      setStatus('Listening');
    } catch {
      setHolding(false);
      setError('The microphone could not be started. You can type instead.');
    }
  }

  function stopTalking() {
    if (!holding) return;
    stopCapture();
    setHolding(false);
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      for (const event of pushToTalkReleaseEvents()) socket.send(JSON.stringify(event));
    }
    setStatus('Ready. Hold the button to talk.');
  }

  function sendText() {
    const socket = socketRef.current;
    const value = text.trim();
    if (!socket || socket.readyState !== WebSocket.OPEN || !value) return;
    for (const event of textTurnEvents(value)) socket.send(JSON.stringify(event));
    setText('');
  }

  async function decide(id: string, action: 'confirm' | 'cancel') {
    setBusyId(id);
    setError('');
    try {
      await apiClient.post(`/voice/pending/${id}/${action}`, {});
      setPending((list) => list.filter((item) => item.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That change was not saved.');
    } finally {
      setBusyId(null);
    }
  }

  if (enabled === null) {
    return <p className="p-6 text-sm text-slate-500">Checking the assistant…</p>;
  }
  if (!enabled) {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Assistant</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          The assistant is switched off for your user. An admin can turn it on from Voice usage.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Assistant</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Hold the button and speak. Each change is read back. Nothing is saved until you confirm.
          </p>
        </div>
        <Link to="/assistant/usage" className="text-sm text-emerald-700 dark:text-emerald-300">
          Usage
        </Link>
      </div>

      <div className="card p-4 space-y-3">
        <p className="text-sm text-slate-500">{status}</p>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {status === 'Off' ? (
            <button
              type="button"
              className="btn-primary min-h-11 px-4"
              onClick={() =>
                void connect().catch((err) => setError(err?.message || 'Could not connect.'))
              }
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary min-h-11 px-4"
              onClick={() => void hangUp()}
            >
              Stop
            </button>
          )}
          <button
            type="button"
            className={`min-h-11 min-w-11 rounded-full px-6 font-semibold ${holding ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}
            onPointerDown={() => void startTalking()}
            onPointerUp={stopTalking}
            onPointerLeave={stopTalking}
            disabled={status === 'Off'}
          >
            {holding ? 'Release to send' : 'Hold to talk'}
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendText();
          }}
        >
          <input
            className="input-field flex-1"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Or type, if the microphone is unavailable"
            aria-label="Message the assistant"
          />
          <button type="submit" className="btn-secondary min-h-11 px-4" disabled={status === 'Off'}>
            Send
          </button>
        </form>
        {transcript && (
          <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
            {transcript}
          </pre>
        )}
      </div>

      {pending.map((card) => (
        <article key={card.id} className="card p-4 space-y-3">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{card.summary}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Before
              </h2>
              <dl className="mt-1 text-sm">
                {linesOf(card.before).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 py-0.5">
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="text-right text-slate-800 dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                After
              </h2>
              <dl className="mt-1 text-sm">
                {linesOf(card.after).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 py-0.5">
                    <dt className="text-slate-500">{key}</dt>
                    <dd className="text-right text-slate-800 dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary min-h-11 px-4"
              disabled={busyId === card.id}
              onClick={() => void decide(card.id, 'confirm')}
            >
              Confirm
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11 px-4"
              disabled={busyId === card.id}
              onClick={() => void decide(card.id, 'cancel')}
            >
              Cancel
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
