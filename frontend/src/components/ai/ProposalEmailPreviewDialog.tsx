import { useEffect, useState } from 'react';
import {
  XMarkIcon,
  EnvelopeIcon,
  SparklesIcon,
  PencilIcon,
  CheckIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
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

  const fetchDraft = async () => {
    setLoading(true);
    setApproved(false);
    setEditing(false);
    setSubject('');
    setBody('');
    setCustomInstruction('');
    setSubjectSuggestions([]);

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
          }
          if (event.error) throw new Error(event.error);
        });
      } else {
        const res = (await apiClient.aiProposalEmailDraft(payload!)) as any;
        if (res.success && res.data) {
          setEmailDraft(res.data);
          setSubject(res.data.subject || '');
          setBody(res.data.textBody || '');
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
      setApproved(false);
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proposalId, draft?.clientId]);

  const handleApprove = () => {
    setApproved(true);
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
        setBody(res.data.revisedBody);
        setApproved(false);
        setSubjectSuggestions([]);
        toast.success('Clara updated the email');
      }
    } catch (e) {
      showAiError(e);
    }
  };

  const fetchSubjectSuggestions = async () => {
    if (!body) return;
    setSuggestingSubjects(true);
    try {
      const res = (await apiClient.aiSuggestEmailSubjects(body, { proposalId, draft })) as any;
      if (res.success && Array.isArray(res.data?.subjects)) {
        setSubjectSuggestions(res.data.subjects);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setSuggestingSubjects(false);
    }
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
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                      <pre className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                        {body}
                      </pre>
                    </div>
                  )}
                </div>

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

                {/* Cheap CTA suggestions - 2-3 stronger calls to action */}
                {body && !loading && (
                  <div className="mt-2">
                    <button
                      onClick={async () => {
                        try {
                          const res = (await apiClient.aiSuggestEmailCtas(body, { proposalId, draft })) as any;
                          if (res.success && Array.isArray(res.data?.ctas)) {
                            const ctas = res.data.ctas as string[];
                            // Append the first one as example, or let user pick
                            const chosen = ctas[0];
                            if (chosen) {
                              const newBody = body.trim().endsWith('.') || body.trim().endsWith('!') || body.trim().endsWith('?')
                                ? body.trim() + '\n\n' + chosen
                                : body.trim() + '. ' + chosen;
                              setBody(newBody);
                              toast.success('Added a stronger CTA from Clara');
                            }
                          }
                        } catch (e) { showAiError(e); }
                      }}
                      className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                    >
                      <SparklesIcon className="h-3.5 w-3.5" /> Clara suggest stronger CTAs (tiny cost)
                    </button>
                  </div>
                )}

                {body && !loading && (
                  <div className="mt-2">
                    <button
                      onClick={fetchSubjectSuggestions}
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
                            onClick={() => { setSubject(s); setSubjectSuggestions([]); }}
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