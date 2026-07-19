import { useEffect, useState, useId } from 'react';
import type { Suggestion, ValidationResult } from '@/types';
import {
  validateWikidataTitle,
  postSuggestion,
  downloadSuggestion,
  backendReachable,
} from '@/lib/suggestions';

interface SuggestFormProps {
  open: boolean;
  onClose: () => void;
}

/**
 * v0.6 — Modal for collecting user-submitted distro suggestions.
 *
 * Drop-in replacement for the previous Framer-Motion version:
 * - No AnimatePresence, no motion.div, no spring physics.
 * - Modal fade uses a plain CSS keyframe (see OverlayFade in this file).
 * - Primary CTA is a high-contrast white-on-black filled button.
 * - Status indicators ("backend: live / offline / ?") are text-only —
 *   no green/amber/red dots, no shadow glow on hover.
 */
export default function SuggestForm({ open, onClose }: SuggestFormProps) {
  const titleId = useId();
  const slugId = useId();
  const parentId = useId();
  const reasonId = useId();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [parent, setParent] = useState('linux_kernel');
  const [reason, setReason] = useState('');

  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validationErr, setValidationErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<
    | { kind: 'backend'; id: string }
    | { kind: 'local'; saved: number }
    | { kind: 'download'; file: string }
    | { kind: 'error'; message: string }
    | null
  >(null);

  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  // Esc closes the modal; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Lightweight backend-health check on open (best-effort; don't block UI).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void backendReachable().then((up) => {
      if (!cancelled) setBackendUp(up);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function reset() {
    setTitle('');
    setSlug('');
    setParent('linux_kernel');
    setReason('');
    setValidating(false);
    setValidation(null);
    setValidationErr(null);
    setSubmitting(false);
    setSubmitResult(null);
  }

  function close() {
    reset();
    onClose();
  }

  // Auto-slug from the validated display name unless the user typed one.
  useEffect(() => {
    if (validation && !slug) {
      const guess = validation.display
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setSlug(guess);
    }
  }, [validation, slug]);

  async function onValidate(e: React.FormEvent) {
    e.preventDefault();
    setValidating(true);
    setValidationErr(null);
    setValidation(null);
    try {
      const v = await validateWikidataTitle(title);
      setValidation(v);
    } catch (err) {
      setValidationErr(err instanceof Error ? err.message : String(err));
    } finally {
      setValidating(false);
    }
  }

  async function onSubmit() {
    if (!validation || !slug || !reason.trim()) return;
    const payload: Suggestion = {
      wikipedia_title: title.trim(),
      slug: slug.trim(),
      parent: parent.trim(),
      reason: reason.trim(),
      qid: validation.qid,
      short_desc: validation.short_desc,
      extract: validation.extract,
      thumbnail: validation.thumbnail,
      wiki_url: validation.wiki_url,
      submitted_at: new Date().toISOString(),
      submitter_label: 'browser',
    };
    setSubmitting(true);
    try {
      const result = await postSuggestion(payload);
      if (result.ok) {
        if (result.via === 'backend') {
          setSubmitResult({ kind: 'backend', id: result.id ?? 'unknown' });
        } else {
          // localStorage saved; also offer download as belt-and-braces.
          downloadSuggestion(payload);
          setSubmitResult({ kind: 'download', file: payload.slug });
        }
      } else {
        setSubmitResult({ kind: 'error', message: result.error });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = !!validation && slug.length >= 2 && reason.trim().length >= 4;

  if (!open) return null;

  return (
    <div
      className="suggest-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/85"
      onClick={close}
      role="presentation"
    >
      <style>{`
        @keyframes suggest-over { from { opacity: 0 } to { opacity: 1 } }
        @keyframes suggest-in   { from { opacity: 0; transform: translateY(8px) }
                                  to   { opacity: 1; transform: translateY(0) } }
        .suggest-overlay { animation: suggest-over 140ms ease-out both }
        .suggest-card    { animation: suggest-in 200ms ease-out both }
      `}</style>

      <div
        className="suggest-card relative w-full max-w-lg max-h-[90vh] overflow-y-auto
                   rounded-md border border-panel-border bg-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${titleId}-heading`}
      >
        <header className="sticky top-0 z-10 bg-panel border-b border-panel-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                Add a distro
              </div>
              <h2
                id={`${titleId}-heading`}
                className="text-xl font-bold text-ink-50 mt-1"
              >
                Suggest a distribution
              </h2>
              <p className="text-[12.5px] text-ink-100 mt-1 leading-snug">
                We validate against Wikipedia, then queue the
                suggestion. No account needed.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close suggest form"
              className="rounded border border-panel-border px-2 py-1
                         text-ink-400 hover:text-ink-50 hover:border-ink-600
                         font-mono transition-colors"
            >
              esc
            </button>
          </div>

          <div
            className="mt-3 inline-flex items-center gap-2 rounded px-2 py-1
                       text-[10.5px] font-mono uppercase tracking-wider
                       border border-panel-border bg-bg text-ink-400"
            title={
              backendUp === null
                ? 'Checking backend…'
                : backendUp
                  ? 'Connected to /api/suggestions — suggestion will go straight to the maintainer queue.'
                  : 'Backend not running — suggestion will be saved locally + downloadable.'
            }
          >
            backend:
            <span className="text-ink-50">
              {backendUp === null
                ? '?'
                : backendUp
                  ? 'live'
                  : 'offline (local+download)'}
            </span>
          </div>
        </header>

        <div className="px-5 py-5 space-y-5">
          <form onSubmit={onValidate} className="space-y-4">
            <div>
              <label
                htmlFor={titleId}
                className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 mb-1"
              >
                Wikipedia title
              </label>
              <div className="flex gap-2">
                <input
                  id={titleId}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setValidation(null);
                    setValidationErr(null);
                  }}
                  placeholder="e.g. Linux Mint"
                  className="flex-1 rounded border border-panel-border bg-bg px-3 py-2
                             text-sm text-ink-50 placeholder-ink-400 outline-none
                             focus:border-ink-50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!title.trim() || validating}
                  className="rounded border border-panel-border px-3 py-2
                             text-[12px] font-mono uppercase tracking-wider
                             text-ink-100 hover:text-ink-50 hover:border-ink-600
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {validating ? 'checking…' : 'validate'}
                </button>
              </div>
              {validationErr && (
                <p
                  role="alert"
                  className="mt-2 text-[12px] font-mono text-ink-400"
                >
                  ⚠ {validationErr}
                </p>
              )}
            </div>
          </form>

          {validation && (
            <div className="rounded border border-panel-border bg-bg p-3">
              <div className="flex items-center gap-3">
                {validation.thumbnail && (
                  <img
                    src={validation.thumbnail}
                    alt=""
                    className="w-12 h-12 rounded-md object-cover border border-panel-border bg-panel shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-ink-50 font-semibold truncate">
                    {validation.display}
                  </div>
                  <div className="text-[11.5px] text-ink-100 line-clamp-2">
                    {validation.short_desc}
                  </div>
                  <div className="text-[10.5px] font-mono text-ink-400 mt-1">
                    {validation.qid ?? 'no-qid'} ·{' '}
                    <a
                      href={validation.wiki_url}
                      className="text-ink-50 underline underline-offset-2 hover:no-underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      wiki
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor={slugId}
                className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 mb-1"
              >
                Slug
              </label>
              <input
                id={slugId}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, '_')
                      .replace(/^_+|_+$/g, ''),
                  )
                }
                placeholder="lowercase_with_underscore"
                className="w-full rounded border border-panel-border bg-bg px-3 py-2
                           text-sm font-mono text-ink-50 placeholder-ink-400 outline-none
                           focus:border-ink-50 transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor={parentId}
                className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 mb-1"
              >
                Parent in tree
              </label>
              <select
                id={parentId}
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                className="w-full rounded border border-panel-border bg-bg px-3 py-2
                           text-sm font-mono text-ink-50 outline-none
                           focus:border-ink-50 transition-colors"
              >
                {[
                  'linux_kernel',
                  'debian',
                  'ubuntu',
                  'arch',
                  'fedora',
                  'gentoo',
                  'slackware',
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor={reasonId}
              className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400 mb-1"
            >
              Why it belongs in the graph
            </label>
            <textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="One sentence — why is this distro interesting?"
              className="w-full rounded border border-panel-border bg-bg px-3 py-2
                         text-sm text-ink-50 placeholder-ink-400 outline-none resize-none
                         focus:border-ink-50 transition-colors"
            />
          </div>

          {/* Submit row + state messages */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || submitting}
              className="rounded bg-ink-50 text-bg px-4 py-2 text-[13px] font-bold
                         hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors"
            >
              {submitting ? 'sending…' : 'Submit suggestion'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded border border-panel-border px-3 py-2 text-[12px]
                         font-mono text-ink-400 hover:text-ink-50 hover:border-ink-600
                         transition-colors"
            >
              reset
            </button>
            {submitResult?.kind === 'backend' && (
              <span className="text-[12px] font-mono text-ink-100">
                ✓ saved to server (id: {submitResult.id})
              </span>
            )}
            {submitResult?.kind === 'download' && (
              <span className="text-[12px] font-mono text-ink-100">
                ✓ saved locally — JSON downloaded ({submitResult.file}.json)
              </span>
            )}
            {submitResult?.kind === 'error' && (
              <span className="text-[12px] font-mono text-ink-400">
                ⚠ {submitResult.message}
              </span>
            )}
          </div>

          <p className="text-[10.5px] font-mono text-ink-500 leading-relaxed">
            Suggestions go to <code className="text-ink-100">.cache/api/suggestions.json</code>
            {backendUp ? null : (
              <>
                {'. '}
                <span className="text-ink-100">
                  Backend offline — a JSON file is also being downloaded
                  so you can paste it into the file yourself.
                </span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
