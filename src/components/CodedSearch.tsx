'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The coded search box.
 *
 * This component IS the design. Everything else on the encounter screen is
 * ordinary form work; if this feels slower than typing a sentence, clinicians
 * route around the system and every downstream promise — the analytics, the
 * surveillance signals, the interaction checks — quietly stops being true.
 *
 * Rules it must obey:
 *   - type first, always; never make anyone browse a hierarchy
 *   - the top result is pre-highlighted, so Enter alone completes the
 *     common case
 *   - keyboard end to end: ↑ ↓ Enter Esc, no mouse required
 *   - never a dead end — an unmatched query falls through to a note
 */

export interface SearchResult {
  /** The code, shown greyed and right-aligned. */
  code: string;
  /** What the clinician reads. */
  title: string;
  /** Optional badge — notifiable, restricted. */
  badge?: { label: string; tone: 'gov' | 'caution' | 'critical' };
  /** Secondary line, e.g. the standard dose for a medicine. */
  detail?: string;
}

interface CodedSearchProps {
  label: string;
  placeholder: string;
  /** Runs on every keystroke after the debounce. Must be synchronous-fast. */
  onQuery: (query: string) => SearchResult[];
  onSelect: (result: SearchResult) => void;
  /** Offered when nothing matches, so the clinician is never stuck. */
  onKeepAsNote?: (text: string) => void;
  autoFocus?: boolean;
}

/** Long enough to avoid a query per keystroke, short enough to feel instant. */
const DEBOUNCE_MS = 120;

export function CodedSearch({
  label,
  placeholder,
  onQuery,
  onSelect,
  onKeepAsNote,
  autoFocus = false,
}: CodedSearchProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    if (debounced.trim().length < 2) {
      setElapsed(null);
      return [];
    }
    const started = performance.now();
    const hits = onQuery(debounced);
    setElapsed(Math.round((performance.now() - started) * 10) / 10);
    return hits;
    // onQuery is stable per parent render; re-running on it would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // The top result is always pre-selected, so two keystrokes and a return
  // record a coded diagnosis.
  useEffect(() => setHighlighted(0), [debounced]);

  useEffect(() => {
    listRef.current
      ?.querySelectorAll('li')
      [highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const noMatch = debounced.trim().length >= 2 && results.length === 0;

  function commit(result: SearchResult) {
    onSelect(result);
    setQuery('');
    setDebounced('');
    // Focus stays in the box: a clinician recording two diagnoses should
    // not have to reach for the mouse between them.
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (results[highlighted]) commit(results[highlighted]);
      else if (noMatch && onKeepAsNote) {
        onKeepAsNote(query.trim());
        setQuery('');
        setDebounced('');
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery('');
      setDebounced('');
    }
  }

  const listboxId = `${label.replace(/\s+/g, '-').toLowerCase()}-results`;

  return (
    <div>
      <label htmlFor={`${listboxId}-input`} className="eyebrow mb-1.5 block">
        {label}
      </label>

      <div className="relative">
        <input
          id={`${listboxId}-input`}
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={
            results[highlighted] ? `${listboxId}-${highlighted}` : undefined
          }
          className="w-full rounded-md border-2 border-rule bg-surface px-3 py-2.5 text-base
                     text-ink placeholder:text-ink-faint focus:border-gov focus:outline-none"
        />

        {elapsed !== null && (
          /* Surfacing the latency is not decoration: it is the claim the
             whole design rests on, and it should be falsifiable on sight. */
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[0.65rem] text-ink-faint">
            {elapsed}ms · local
          </span>
        )}
      </div>

      {results.length > 0 && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          className="mt-1.5 max-h-72 overflow-y-auto rounded-md border border-rule bg-surface"
        >
          {results.map((r, i) => {
            const active = i === highlighted;
            return (
              <li
                key={r.code}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => commit(r)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${
                  active ? 'bg-gov-soft' : ''
                } ${i > 0 ? 'border-t border-rule-soft' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      active ? 'font-semibold text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {r.title}
                  </p>
                  {r.detail && (
                    <p className="truncate text-micro text-ink-faint">{r.detail}</p>
                  )}
                </div>

                {r.badge && (
                  <span className={`chip chip-${r.badge.tone}`}>{r.badge.label}</span>
                )}

                {/* Codes shown greyed: clinicians who know them can type
                    them directly, everyone else ignores them, and over time
                    they build familiarity. */}
                <span
                  className={`shrink-0 font-mono text-micro ${
                    active ? 'text-gov' : 'text-ink-faint'
                  }`}
                >
                  {r.code}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {noMatch && (
        /* Never a dead end. A clinician who hits one goes back to prose
           permanently, and the coded-data premise dies with it. */
        <div className="mt-1.5 rounded-md border border-caution/40 bg-caution-soft px-3 py-2.5">
          <p className="text-sm font-semibold text-caution">No confident match</p>
          <p className="mt-0.5 text-micro text-ink-soft">
            Press Enter to keep &ldquo;{query.trim()}&rdquo; as a clinical note, or
            keep typing.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <p className="mt-1.5 font-mono text-[0.65rem] text-ink-faint">
          ↑ ↓ to move · ENTER to select · ESC to clear
        </p>
      )}
    </div>
  );
}
