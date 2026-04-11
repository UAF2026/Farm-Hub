'use client';

import { SyncStatus } from './FarmHub';
import { useEffect, useState } from 'react';

export default function Header({ syncStatus, syncLabel }: { syncStatus: SyncStatus; syncLabel: string }) {
  const [dateStr, setDateStr] = useState('');
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
  }, []);

  return (
    <div className="header">
      <div>
        <div className="header-logo">Upper Assendon Farm Hub</div>
        <div className="header-sub">M J Hunt &amp; Son</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="sync-pill">
          <div className={`sync-dot${syncStatus ? ' ' + syncStatus : ''}`} />
          <span>{syncLabel}</span>
        </div>
        <div style={{ fontSize: 11, opacity: .7 }}>{dateStr}</div>
      </div>
    </div>
  );
}
