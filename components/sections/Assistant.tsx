'use client';

import { useState, useRef, useEffect } from 'react';
import { FarmData } from '@/lib/types';

interface Props { db: FarmData; }

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function Assistant({ db }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chips = [
    'What SFI actions suit a Wagyu cross beef and arable farm in the Chilterns?',
    'How can I improve finishing margins for Wagyu cross cattle?',
    'What crop rotation suits a mixed farm on the Chilterns escarpment?',
    'Key compliance dates for beef cattle and arable this year?',
    'What are the marketing opportunities for Wagyu cross beef in the UK?',
    'Give me 5 practical efficiency ideas for a mixed beef and arable farm'
  ];

  async function sendMessage(text: string) {
    if (!text.trim()) return;

    const apiKey = typeof window !== 'undefined' ? localStorage.getItem('uaf_anthropic_key') : null;
    if (!apiKey) {
      setNoKey(true);
      return;
    }

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const cattleCount = db.cattle?.length || 0;
    const fieldCount = db.fields?.length || 0;

    const systemPrompt = `You are the farm assistant for Upper Assendon Farm, M J Hunt & Son — mixed Wagyu cross beef and arable near Henley-on-Thames, Chilterns, Oxfordshire. Farm: ${cattleCount} cattle, ${fieldCount} fields. Friendly, expert, practical. UK farming focus. Concise, actionable, British English.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [...messages, userMsg]
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data = await response.json();
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.content[0]?.text || 'No response'
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        role: 'assistant',
        content: 'Error: ' + String(err).slice(0, 100)
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  if (noKey) {
    return (
      <div className="card">
        <div className="card-title">Farm Assistant</div>
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
          To use the farm assistant, please save your Anthropic API key in <strong>Settings</strong>.
        </div>
      </div>
    );
  }

  return (
    <>
      {messages.length === 0 ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="card-title">Farm Assistant</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Ask questions about SFI, CS, crop rotation, livestock management, and more.
          </p>
          <div className="ai-chips">
            {chips.map((chip, i) => (
              <button
                key={i}
                className="ai-chip"
                onClick={() => sendMessage(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ maxHeight: 500, overflowY: 'auto', marginBottom: '1rem' }}>
          <div style={{ padding: 0 }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className="ai-message"
                style={{
                  background: msg.role === 'user' ? 'var(--bg-secondary)' : 'var(--green)',
                  color: msg.role === 'user' ? 'var(--text)' : 'white',
                  marginBottom: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius)',
                  fontSize: 13,
                  lineHeight: 1.6
                }}
              >
                {msg.role === 'assistant' && <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 11, opacity: 0.9 }}>Farm assistant</div>}
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="ai-message" style={{ background: 'var(--green)', color: 'white', padding: '0.75rem', borderRadius: 'var(--radius)', fontSize: 13 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 11, opacity: 0.9 }}>Farm assistant</div>
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      <div className="ai-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question..."
          style={{
            flex: 1,
            padding: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontFamily: 'inherit',
            fontSize: 13,
            resize: 'none',
            minHeight: 60
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="btn-primary"
          style={{
            alignSelf: 'flex-end',
            marginLeft: '0.5rem'
          }}
        >
          Send
        </button>
      </div>
    </>
  );
}
