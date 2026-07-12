'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Farm Hub Error]', error);
  }, [error]);

  return (
    <div style={{ padding: '2rem', fontFamily: 'DM Sans, sans-serif', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ background: '#fcecea', border: '1px solid #f5c6c2', borderRadius: 8, padding: '1.5rem', marginTop: '3rem' }}>
        <div style={{ fontFamily: 'Lora, serif', fontSize: 18, color: '#c0392b', marginBottom: 8 }}>
          Something went wrong
        </div>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.65 }}>
          An error occurred loading this section. Here's the details:
        </div>
        <pre style={{
          background: '#fff',
          border: '1px solid #f5c6c2',
          borderRadius: 6,
          padding: '0.75rem 1rem',
          fontSize: 12,
          fontFamily: 'monospace',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: '#c0392b',
          marginBottom: 16,
        }}>
          {error.message}
          {error.stack ? '\n\n' + error.stack : ''}
        </pre>
        <button
          onClick={reset}
          style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 14 }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
