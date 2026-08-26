'use client';

import { useState, useEffect, useRef } from 'react';
import { FarmData, FieldOperation } from '@/lib/types';
import { uid, fmtDate as fmtFullDate } from '@/lib/utils';

// Web Speech API types (not in default TS lib)
type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResultItem = { isFinal: boolean; [index: number]: SpeechRecognitionAlternative };
type SpeechRecognitionEvent = { resultIndex: number; results: { length: number; [index: number]: SpeechRecognitionResultItem } };
type SpeechRecognitionInstance = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type Tag = 'untagged' | 'job' | 'idea' | 'reminder' | 'question';
type Status = 'open' | 'actioned' | 'dismissed';

interface Entry {
  id: string;
  created_at: string;
  content: string;
  tag: Tag;
  status: Status;
  actioned_at?: string;
  notes?: string;
}

const TAG_COLOURS: Record<Tag, string> = {
  untagged:  '#888',
  job:       '#e67e22',
  idea:      '#2980b9',
  reminder:  '#8e44ad',
  question:  '#27ae60',
};

const TAG_ICONS: Record<Tag, string> = {
  untagged:  '•',
  job:       '🔧',
  idea:      '💡',
  reminder:  '⏰',
  question:  '❓',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface ParsedOp {
  field: string;
  matchedField: boolean;
  operation: string;
  crop: string;
  variety: string;
  rate: string;
  date: string;
}

interface Props {
  db?: FarmData;
  persist?: (db: FarmData) => void;
  addActivity?: (msg: string) => void;
}

export default function BrainDump({ db, persist, addActivity }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [tag, setTag] = useState<Tag>('untagged');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'open' | 'actioned' | 'all'>('open');
  const [listening, setListening] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [parsing, setParsing] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ParsedOp>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => { loadEntries(); }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const res = await fetch('/api/braindump');
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/braindump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim(), tag }),
      });
      if (res.ok) {
        const entry = await res.json();
        setEntries(prev => [entry, ...prev]);
        setText('');
        setTag('untagged');
        textareaRef.current?.focus();
      }
    } finally {
      setSending(false);
    }
  }

  async function updateEntry(id: string, updates: Partial<Pick<Entry, 'status' | 'tag' | 'notes'>>) {
    await fetch('/api/braindump', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }

  async function deleteEntry(id: string) {
    await fetch('/api/braindump', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  // ── Parse a Brain Dump entry into a structured farm operation ───────────
  // Uses the same client-side Anthropic call pattern as the invoice scanner
  // in Finance.tsx. Never writes anything until the user confirms the draft.
  function currentSeasonFieldNames(): string[] {
    const seasons = db?.croppingPlans ?? [];
    if (!seasons.length) return [];
    const season = seasons.find(s => s.season === '26/27') ?? seasons[seasons.length - 1];
    return (season.plans ?? []).map(p => p.fieldName);
  }

  async function parseEntry(entry: Entry) {
    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('uaf_anthropic_key') : null;
    if (!apiKey) { alert('Please set your Anthropic API key in Settings first'); return; }
    setParsing(entry.id);
    try {
      const fieldNames = currentSeasonFieldNames();
      const today = new Date().toISOString().slice(0, 10);
      const prompt = `You are extracting a structured farm job record from a short note a farmer dictated. Note: "${entry.content}"\n\nKnown field names on this farm (match against these if possible, case-insensitively, allow for spelling/hearing variation): ${fieldNames.length ? fieldNames.join(', ') : '(no field list available)'}\n\nToday's date is ${today} if the note doesn't state one.\n\nReturn ONLY JSON, no other text, in this exact shape:\n{"field": "best matching field name from the list, or the raw name mentioned if no good match", "matchedField": true/false, "operation": "short verb phrase e.g. Drilled / Sprayed / Fertilised / Rolled / Harvested", "crop": "", "variety": "", "rate": "e.g. 180 kg/ha, blank if not mentioned", "date": "YYYY-MM-DD"}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-opus-4-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!response.ok) { alert('Parse failed: ' + (await response.text())); return; }
      const result = await response.json();
      const raw = result.content?.[0]?.text ?? '{}';
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : raw);
      setDrafts(prev => ({
        ...prev,
        [entry.id]: {
          field: parsed.field || '',
          matchedField: !!parsed.matchedField,
          operation: parsed.operation || '',
          crop: parsed.crop || '',
          variety: parsed.variety || '',
          rate: parsed.rate || '',
          date: parsed.date || today,
        },
      }));
    } catch {
      alert('Could not parse that entry. You can still log it manually via Field Records.');
    } finally {
      setParsing(null);
    }
  }

  function updateDraft(id: string, field: keyof ParsedOp, value: string | boolean) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } as ParsedOp }));
  }

  function discardDraft(id: string) {
    setDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
  }

  function applyDraft(entry: Entry) {
    const draft = drafts[entry.id];
    if (!draft || !db || !persist) return;

    const op: FieldOperation = {
      id: uid(),
      date: draft.date,
      field: draft.field,
      operation: draft.operation,
      crop: draft.crop || undefined,
      variety: draft.variety || undefined,
      rate: draft.rate || undefined,
      notes: entry.content,
      matchedField: draft.matchedField,
      source: `brain_dump:${entry.id}`,
      createdAt: new Date().toISOString(),
    };

    const existingOps = db.fieldOperations ?? [];
    let newDb: FarmData = { ...db, fieldOperations: [op, ...existingOps] };

    // If matched to a field in the current cropping plan, append a note there too —
    // never silently overwrite the planned crop, just leave a trail.
    if (draft.matchedField && db.croppingPlans?.length) {
      const seasons = db.croppingPlans;
      const seasonIdx = seasons.findIndex(s => s.season === '26/27');
      const idx = seasonIdx >= 0 ? seasonIdx : seasons.length - 1;
      const season = seasons[idx];
      const plans = (season.plans ?? []).map(p => {
        if (p.fieldName !== draft.field) return p;
        const opNote = `${draft.operation}${draft.crop ? ' ' + draft.crop : ''}${draft.variety ? ' (' + draft.variety + ')' : ''}${draft.rate ? ' @ ' + draft.rate : ''} on ${fmtFullDate(draft.date)} — logged via Brain Dump.`;
        return { ...p, notes: p.notes ? `${p.notes}\n${opNote}` : opNote };
      });
      const newSeasons = seasons.map((s, i) => i === idx ? { ...season, plans, lastUpdated: new Date().toISOString() } : s);
      newDb = { ...newDb, croppingPlans: newSeasons };
    }

    persist(newDb);
    addActivity?.(`Logged farm job: ${draft.operation} on ${draft.field}${draft.rate ? ' @ ' + draft.rate : ''}`);
    updateEntry(entry.id, { status: 'actioned', notes: `Applied to farm ops log: ${draft.operation} on ${draft.field}` });
    discardDraft(entry.id);
  }

  function toggleVoice() {
    type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
    const w = window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      alert('Voice input not supported in this browser. Try Chrome on Android or Safari on iPhone.');
      return;
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognitionRef.current = recognition;

    let finalText = text;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += (finalText ? ' ' : '') + transcript;
        } else {
          interim = transcript;
        }
      }
      setText(finalText + (interim ? ' ' + interim : ''));
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.start();
    setListening(true);
  }

  const filtered = entries.filter(e =>
    filter === 'all' ? true :
    filter === 'open' ? e.status === 'open' :
    e.status === 'actioned'
  );

  const openCount = entries.filter(e => e.status === 'open').length;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '12px 12px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, margin: 0, color: 'var(--green)' }}>
          Brain Dump
        </h2>
        <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
          Capture any thought, job or idea before it disappears
          {openCount > 0 && <span style={{ marginLeft: 8, background: 'var(--green)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 12 }}>{openCount} open</span>}
        </p>
      </div>

      {/* Input box */}
      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(); }}
          placeholder="What's on your mind? Type or tap the mic to speak..."
          style={{
            width: '100%', minHeight: 90, resize: 'vertical',
            border: '1px solid #ddd', borderRadius: 8, padding: 10,
            fontSize: 15, fontFamily: 'var(--font-body)', lineHeight: 1.5,
            boxSizing: 'border-box', outline: 'none',
            background: listening ? '#fff8e1' : '#fff',
            transition: 'background 0.2s',
          }}
        />

        {/* Tag selector */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {(Object.keys(TAG_ICONS) as Tag[]).map(t => (
            <button
              key={t}
              onClick={() => setTag(t)}
              style={{
                padding: '4px 10px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                border: `2px solid ${tag === t ? TAG_COLOURS[t] : '#ddd'}`,
                background: tag === t ? TAG_COLOURS[t] : '#f8f8f8',
                color: tag === t ? '#fff' : '#555',
                fontWeight: tag === t ? 600 : 400,
                transition: 'all 0.15s',
              }}
            >
              {TAG_ICONS[t]} {t}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={toggleVoice}
            title="Voice input"
            style={{
              padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: listening ? '#e74c3c' : '#f0f0f0',
              color: listening ? '#fff' : '#555',
              fontSize: 18, transition: 'all 0.2s',
              animation: listening ? 'pulse 1s infinite' : 'none',
            }}
          >
            🎤
          </button>
          <button
            onClick={submit}
            disabled={!text.trim() || sending}
            style={{
              flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none',
              background: text.trim() ? 'var(--green)' : '#ccc',
              color: '#fff', fontSize: 15, fontWeight: 600, cursor: text.trim() ? 'pointer' : 'default',
              transition: 'background 0.2s',
            }}
          >
            {sending ? 'Saving...' : '📥  Save'}
          </button>
        </div>
        {listening && (
          <p style={{ margin: '8px 0 0', color: '#e74c3c', fontSize: 12, textAlign: 'center' }}>
            🔴 Listening... tap mic again to stop
          </p>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['open', 'actioned', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 14px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: filter === f ? 'var(--green)' : '#eee',
              color: filter === f ? '#fff' : '#555',
              fontSize: 13, fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f === 'open' ? 'Open' : f === 'actioned' ? 'Done' : 'All'}
          </button>
        ))}
      </div>

      {/* Entries */}
      {loading ? (
        <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>
          {filter === 'open' ? 'Nothing open — all clear 👍' : 'Nothing here yet'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(entry => {
            const isExpanded = expandedId === entry.id;
            const isDone = entry.status !== 'open';
            return (
              <div
                key={entry.id}
                className="card"
                style={{
                  padding: '12px 14px',
                  opacity: isDone ? 0.65 : 1,
                  borderLeft: `4px solid ${TAG_COLOURS[entry.tag as Tag] ?? '#ccc'}`,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      margin: 0, fontSize: 14, lineHeight: 1.5,
                      textDecoration: isDone ? 'line-through' : 'none',
                      color: isDone ? '#999' : '#222',
                      whiteSpace: 'pre-wrap',
                    }}>
                      {entry.content}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#aaa' }}>{fmtDate(entry.created_at)}</span>
                      <span style={{
                        fontSize: 11, padding: '1px 7px', borderRadius: 10,
                        background: TAG_COLOURS[entry.tag as Tag] ?? '#ccc',
                        color: '#fff',
                      }}>
                        {TAG_ICONS[entry.tag as Tag]} {entry.tag}
                      </span>
                      {isDone && <span style={{ fontSize: 11, color: '#27ae60' }}>✓ {entry.status}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18, padding: '0 2px', flexShrink: 0 }}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                </div>

                {/* Expanded actions */}
                {isExpanded && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
                    {/* Change tag */}
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ margin: '0 0 5px', fontSize: 12, color: '#888' }}>Tag as:</p>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {(Object.keys(TAG_ICONS) as Tag[]).map(t => (
                          <button
                            key={t}
                            onClick={() => updateEntry(entry.id, { tag: t })}
                            style={{
                              padding: '3px 8px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
                              border: `1.5px solid ${entry.tag === t ? TAG_COLOURS[t] : '#ddd'}`,
                              background: entry.tag === t ? TAG_COLOURS[t] : '#f8f8f8',
                              color: entry.tag === t ? '#fff' : '#555',
                            }}
                          >
                            {TAG_ICONS[t]} {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {entry.status === 'open' && db && persist && !drafts[entry.id] && (
                        <button
                          onClick={() => parseEntry(entry)}
                          disabled={parsing === entry.id}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #2980b9', background: '#eaf3fb', color: '#2980b9', fontSize: 12, cursor: 'pointer' }}
                        >
                          {parsing === entry.id ? 'Reading…' : '🔍 Parse as farm job'}
                        </button>
                      )}
                      {entry.status === 'open' && (
                        <button
                          onClick={() => { updateEntry(entry.id, { status: 'actioned' }); setExpandedId(null); }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#27ae60', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                        >
                          ✓ Mark done
                        </button>
                      )}
                      {entry.status !== 'open' && (
                        <button
                          onClick={() => updateEntry(entry.id, { status: 'open' })}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer' }}
                        >
                          ↩ Reopen
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('Delete this entry?')) { deleteEntry(entry.id); setExpandedId(null); } }}
                        style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#e74c3c', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                      >
                        🗑 Delete
                      </button>
                    </div>

                    {/* Parsed farm job draft — nothing is saved until Apply is pressed */}
                    {drafts[entry.id] && (
                      <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#f6fbff', border: '1px solid #cfe4f5' }}>
                        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#2980b9' }}>
                          Check this before applying{drafts[entry.id].matchedField ? '' : ' — field name not matched to your cropping plan, edit it below'}:
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                          <label style={{ fontSize: 11, color: '#666' }}>Field
                            <input value={drafts[entry.id].field} onChange={e => updateDraft(entry.id, 'field', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 5, border: '1px solid #ccc' }} />
                          </label>
                          <label style={{ fontSize: 11, color: '#666' }}>Operation
                            <input value={drafts[entry.id].operation} onChange={e => updateDraft(entry.id, 'operation', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 5, border: '1px solid #ccc' }} />
                          </label>
                          <label style={{ fontSize: 11, color: '#666' }}>Crop
                            <input value={drafts[entry.id].crop} onChange={e => updateDraft(entry.id, 'crop', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 5, border: '1px solid #ccc' }} />
                          </label>
                          <label style={{ fontSize: 11, color: '#666' }}>Variety
                            <input value={drafts[entry.id].variety} onChange={e => updateDraft(entry.id, 'variety', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 5, border: '1px solid #ccc' }} />
                          </label>
                          <label style={{ fontSize: 11, color: '#666' }}>Rate
                            <input value={drafts[entry.id].rate} onChange={e => updateDraft(entry.id, 'rate', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 5, border: '1px solid #ccc' }} />
                          </label>
                          <label style={{ fontSize: 11, color: '#666' }}>Date
                            <input type="date" value={drafts[entry.id].date} onChange={e => updateDraft(entry.id, 'date', e.target.value)} style={{ width: '100%', padding: '4px 6px', fontSize: 12, borderRadius: 5, border: '1px solid #ccc' }} />
                          </label>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => applyDraft(entry)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2980b9', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                            ✓ Apply to farm records
                          </button>
                          <button onClick={() => discardDraft(entry.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer' }}>
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
