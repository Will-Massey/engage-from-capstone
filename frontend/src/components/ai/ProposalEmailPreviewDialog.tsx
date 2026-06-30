import { useEffect, useState, useRef } from 'react';
import {
  XMarkIcon,
  EnvelopeIcon,
  SparklesIcon,
  PencilIcon,
  CheckIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';
import { showAiError } from './AiPanel';
import { toast } from 'react-hot-toast';

export interface ProposalEmailDraft {
  subject: string;
  htmlBody: string;
  textBody: string;
  requiresApproval?: boolean;
}

export interface ProposalEmailDraftInput {
  clientId: string;
  title?: string;
  reference?: string;
  coverLetter?: string;
  validUntil?: string;
  practiceName?: string;
  senderName?: string;
  services: Array<{ name: string; billingFrequency?: string; displayPrice?: number }>;
}

export interface ApprovedProposalEmail {
  subject: string;
  textBody: string;
  htmlBody?: string;
}

interface ProposalEmailPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  proposalId?: string;
  draft?: ProposalEmailDraftInput;
  onSend?: (approved: ApprovedProposalEmail) => Promise<void>;
  previewOnly?: boolean;
}

export default function ProposalEmailPreviewDialog({
  open,
  onClose,
  proposalId,
  draft,
  onSend,
  previewOnly = false,
}: ProposalEmailPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [approved, setApproved] = useState(false);
  const [emailDraft, setEmailDraft] = useState<ProposalEmailDraft | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [subjectSuggestions, setSubjectSuggestions] = useState<string[]>([]);
  const [suggestingSubjects, setSuggestingSubjects] = useState(false);
  const [emailIssues, setEmailIssues] = useState<string[]>([]);
  const [analyzingEmail, setAnalyzingEmail] = useState(false);
  const [ctaSuggestions, setCtaSuggestions] = useState<string[]>([]);
  const [suggestingCtas, setSuggestingCtas] = useState(false);
  const [bodyVersionAccepted, setBodyVersionAccepted] = useState(false);

  const analyzeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchDraft = async () => {
    setLoading(true);
    setApproved(false);
    setEditing(false);
    setSubject('');
    setBody('');
    setCustomInstruction('');
    setSubjectSuggestions([]);
    setEmailIssues([]);
    setCtaSuggestions([]);
    setBodyVersionAccepted(false);

    const payload = proposalId ? { proposalId } : draft;

    try {
      const streamer = (apiClient as any).aiStreamProposalEmailDraft;
      if (typeof streamer === 'function') {
        let finalSubject = '';
        let accumulatedBody = '';

        await streamer(payload, (event: any) => {
          if (event.subject) {
            finalSubject = event.subject;
            setSubject(event.subject);
          }
          if (event.bodyChunk) {
            accumulatedBody += event.bodyChunk;
            setBody(accumulatedBody);
          }
          if (event.done) {
            setEmailDraft({
              subject: finalSubject,
              htmlBody: '',
              textBody: accumulatedBody,
              requiresApproval: true,
            });
            // Auto-run analyze after draft loads (debounced cheap)
            setTimeout(() => triggerAnalyze(true, accumulatedBody), 20);
          }
          if (event.error) throw new Error(event.error);
        });
      } else {
        const res = (await apiClient.aiProposalEmailDraft(payload!)) as any;
        if (res.success && res.data) {
          setEmailDraft(res.data);
          setSubject(res.data.subject || '');
          setBody(res.data.textBody || '');
          // Auto-run analyze after draft loads (debounced cheap)
          setTimeout(() => triggerAnalyze(true, res.data.textBody || ''), 10);
        }
      }
    } catch (e) {
      showAiError(e);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && (proposalId || draft)) {
      fetchDraft();
    } else if (!open) {
      setEmailDraft(null);
      setSubject('');
      setBody('');
      setCustomInstruction('');
      setSubjectSuggestions([]);
      setEmailIssues([]);
      setCtaSuggestions([]);
      setBodyVersionAccepted(false);
      setApproved(false);
      setEditing(false);
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposalId, draft?.clientId]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (analyzeTimeoutRef.current) clearTimeout(analyzeTimeoutRef.current);
    };
  }, []);

  const handleApprove = () => {
    setApproved(true);
    setBodyVersionAccepted(true);
    setEditing(false);
  };

  const claraTweaks = [
    { label: 'Warmer', instruction: 'Make the tone warmer and more friendly while staying professional.' },
    { label: 'Shorter', instruction: 'Make this 25-30% shorter and punchier. Keep all key info.' },
    { label: 'Add urgency', instruction: 'Add gentle urgency and a clear next step without being pushy.' },
    { label: 'More formal', instruction: 'Make the language slightly more formal and authoritative.' },
  ];

  const applyClaraTweak = async (instruction: string) => {
    if (!body) return;
    try {
      const res = (await apiClient.aiEmailRevise(body, instruction, { proposalId, draft })) as any;
      if (res.success && res.data?.revisedBody) {
        const revised = res.data.revisedBody;
        setBody(revised);
        setApproved(false);
        setSubjectSuggestions([]);
        setBodyVersionAccepted(true);
        toast.success('Clara updated the email');
        triggerAnalyze(false, revised);
        // auto-fetch subjects after major body tweak (per roadmap)
        fetchSubjectSuggestions(revised);
      }
    } catch (e) {
      showAiError(e);
    }
  };

  const fetchSubjectSuggestions = async (overrideBody?: string) => {
    const b = overrideBody || body;
    if (!b) return;
    setSuggestingSubjects(true);
    try {
      const res = (await apiClient.aiSuggestEmailSubjects(b, { proposalId, draft })) as any;
      if (res.success && Array.isArray(res.data?.subjects)) {
        setSubjectSuggestions(res.data.subjects);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setSuggestingSubjects(false);
    }
  };

  const fetchCtaSuggestions = async () => {
    if (!body) return;
    setSuggestingCtas(true);
    try {
      const res = (await apiClient.aiSuggestEmailCtas(body, { proposalId, draft })) as any;
      if (res.success && Array.isArray(res.data?.ctas)) {
        setCtaSuggestions(res.data.ctas);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setSuggestingCtas(false);
    }
  };

  const triggerAnalyze = (immediate = false, overrideBody?: string) => {
    if (analyzeTimeoutRef.current) {
      clearTimeout(analyzeTimeoutRef.current);
    }
    const doAnalyze = () => runEmailAnalysis(overrideBody);
    if (immediate) {
      doAnalyze();
    } else {
      analyzeTimeoutRef.current = setTimeout(doAnalyze, 650); // debounced cheap call
    }
  };

  const runEmailAnalysis = async (overrideBody?: string) => {
    const b = overrideBody || body;
    if (!b || b.trim().length < 20) {
      setEmailIssues([]);
      return;
    }
    setAnalyzingEmail(true);
    try {
      const res = (await apiClient.aiAnalyzeEmail(b, { proposalId, draft })) as any;
      if (res.success && Array.isArray(res.data?.issues)) {
        setEmailIssues(res.data.issues);
      } else {
        setEmailIssues([]);
      }
    } catch {
      // cheap background call — fail silently (low token, avoid noisy toasts)
      setEmailIssues([]);
    } finally {
      setAnalyzingEmail(false);
    }
  };

  const insertCta = (ctaText: string, mode: 'end' | 'replace' = 'end') => {
    if (!body) return;
    let newBody = body.trim();
    if (mode === 'replace') {
      // cleanly replace last sentence
      const lastPunct = Math.max(
        newBody.lastIndexOf('.'),
        newBody.lastIndexOf('!'),
        newBody.lastIndexOf('?')
      );
      if (lastPunct > 20) {
        newBody = newBody.substring(0, lastPunct + 1).trim();
      }
    }
    if (newBody && !/[.!?]$/.test(newBody)) newBody += '.';
    newBody = newBody + '\n\n' + ctaText;
    setBody(newBody);
    setApproved(false);
    setBodyVersionAccepted(true);
    setCtaSuggestions([]); // auto-clear after use
    setSubjectSuggestions([]);
    toast.success('CTA inserted');
    triggerAnalyze(false, newBody);
  };

  const fixIssueWithClara = (issue: string) => {
    applyClaraTweak(`Fix: ${issue}`);
  };

  const textToSimpleHtml = (text: string) =>
    text
      .split(/\n\n+/)
      .filter(Boolean)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');

  const handleSend = async () => {
    if (!approved && !previewOnly) {
      return;
    }
    if (!onSend) return;
    setSending(true);
    try {
      const trimmedBody = body.trim();
      await onSend({
        subject: subject.trim(),
        textBody: trimmedBody,
        htmlBody: editing ? textToSimpleHtml(trimmedBody) : emailDraft?.htmlBody || textToSimpleHtml(trimmedBody),
      });
      onClose();
    } catch {
      // caller handles toast
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto print:hidden">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />

        <div className="relative w-full max-w-2xl rounded-2xl border border-violet-200 dark:border-violet-800 shadow-2xl bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-violet-100 dark:border-violet-900/50 bg-gradient-to-r from-violet-50 to-indigo-50/80 dark:from-violet-950/60 dark:to-indigo-950/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-400/25">
                  <EnvelopeIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Client email preview
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    Drafted by {AI_COPILOT.name} — approve before your client receives it
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4 max-h-[min(70vh,560px)] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center space-y-3" aria-busy="true">
                <SparklesIcon className="h-8 w-8 text-violet-500 mx-auto animate-pulse" />
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {AI_COPILOT.name} is drafting the client email…
                </p>
              </div>
            ) : emailDraft ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Subject
                  </label>
                  {editing ? (
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="input-field w-full text-sm"
                      maxLength={200}
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{subject}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Email body
                  </label>
                  {editing ? (
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={14}
                      className="input-field w-full text-sm font-sans leading-relaxed"
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 relative">
                      <pre className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                        {body}
                      </pre>
                      {(bodyVersionAccepted || approved) && (
                        <div
                          className="absolute top-2 right-2 bg-white/90 dark:bg-slate-900/90 rounded-full p-0.5 border border-green-200 dark:border-green-800"
                          title="Accepted body version"
                        >
                          <CheckIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Prominent Clara email analysis section (after body) — checklist with warning icons + per-issue "Fix this with Clara" */}
                {body && !loading && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Clara email analysis</span>
                      {analyzingEmail && <span className="text-[10px] text-amber-500 dark:text-amber-400">analysing…</span>}
                    </div>
                    {emailIssues.length > 0 ? (
                      <ul className="space-y-1">
                        {emailIssues.map((issue, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 mt-0.5 shrink-0" />
                            <span className="flex-1 text-slate-700 dark:text-slate-300 leading-snug">{issue}</span>
                            <button
                              onClick={() => fixIssueWithClara(issue)}
                              className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
                            >
                              Fix this with Clara
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : !analyzingEmail ? (
                      <div className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                        <CheckIcon className="h-3.5 w-3.5" /> No issues detected
                      </div>
                    ) : null}
                  </div>
                )}

                {body && !loading && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <SparklesIcon className="h-4 w-4 text-primary-600" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Clara quick tweaks (low cost)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {claraTweaks.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => applyClaraTweak(t.instruction)}
                          className="text-xs px-3 py-1 rounded-full border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/30 transition"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom low-token Clara edit - max impact for minimal spend */}
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={customInstruction}
                        onChange={(e) => setCustomInstruction(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && customInstruction.trim()) { applyClaraTweak(customInstruction.trim()); setCustomInstruction(''); } }}
                        placeholder="Or tell Clara exactly what to tweak..."
                        className="input-field flex-1 text-sm py-1.5"
                      />
                      <button
                        onClick={() => { if (customInstruction.trim()) { applyClaraTweak(customInstruction.trim()); setCustomInstruction(''); } }}
                        disabled={!customInstruction.trim()}
                        className="btn-secondary text-xs px-3 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}

                {/* Clara CTA suggestions: show small list (call if not cached); buttons for clean insert at end or replace last sentence */}
                {body && !loading && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 mb-1">
                      <SparklesIcon className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Clara suggested CTAs (tiny cost)</span>
                    </div>
                    {suggestingCtas && (
                      <div className="text-xs text-slate-500 dark:text-slate-400">Clara thinking…</div>
                    )}
                    {ctaSuggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {ctaSuggestions.map((c, idx) => (
                          <div key={idx} className="inline-flex items-center gap-1 rounded-md border border-violet-200 dark:border-violet-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs">
                            <span className="max-w-[220px] truncate text-violet-800 dark:text-violet-200" title={c}>{c}</span>
                            <button
                              onClick={() => insertCta(c, 'end')}
                              className="ml-1 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-600 transition"
                            >
                              Insert this CTA
                            </button>
                            <button
                              onClick={() => insertCta(c, 'replace')}
                              className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline"
                              title="Replace last sentence"
                            >
                              or replace last
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button
                        onClick={() => fetchCtaSuggestions()}
                        disabled={suggestingCtas}
                        className="text-xs text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        <SparklesIcon className="h-3.5 w-3.5" />
                        {suggestingCtas ? 'Thinking…' : 'Suggest stronger CTAs'}
                      </button>
                    )}
                  </div>
                )}

                {body && !loading && (
                  <div className="mt-2">
                    <button
                      onClick={() => fetchSubjectSuggestions()}
                      disabled={suggestingSubjects}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 flex items-center gap-1"
                    >
                      <SparklesIcon className="h-3.5 w-3.5" />
                      {suggestingSubjects ? 'Clara thinking…' : 'Clara suggest subject options (tiny cost)'}
                    </button>
                    {subjectSuggestions.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {subjectSuggestions.map((s, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setSubject(s);
                              setSubjectSuggestions([]); // auto-clear after use
                              triggerAnalyze(); // re-analyze with Clara
                              toast.success('Subject applied + re-analyzed with Clara');
                            }}
                            title="Apply subject + re-analyze with Clara"
                            className={`text-xs px-2 py-1 rounded border transition ${subject === s ? 'bg-primary-50 border-primary-300 text-primary-700 dark:bg-primary-900/30 dark:border-primary-700' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {approved && (
                  <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 rounded-lg px-3 py-2">
                    <CheckIcon className="h-4 w-4 shrink-0" />
                    Approved — ready to send to your client
                  </div>
                )}
              </>
            ) : null}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={fetchDraft}
              disabled={loading}
              className="text-xs inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-violet-600 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Redraft with {AI_COPILOT.shortName}
            </button>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onClose} className="btn-secondary text-sm">
                Cancel
              </button>
              {!loading && emailDraft && (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className="btn-secondary text-sm inline-flex items-center gap-1.5"
                  >
                    <PencilIcon className="h-4 w-4" />
                    {editing ? 'Done editing' : 'Edit'}
                  </button>
                  {!approved && (
                    <button type="button" onClick={handleApprove} className="btn-primary text-sm inline-flex items-center gap-1.5">
                      <CheckIcon className="h-4 w-4" />
                      Approve
                    </button>
                  )}
                  {!previewOnly && onSend && (
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!approved || sending}
                      className="btn-primary text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                      style={{ background: approved ? undefined : undefined }}
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                      {sending ? 'Sending…' : 'Send proposal'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}