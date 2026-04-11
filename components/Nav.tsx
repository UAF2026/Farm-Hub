'use client';

import { Section } from './FarmHub';

const TABS: { id: Section; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'livestock', label: 'Livestock' },
  { id: 'crops', label: 'Crops' },
  { id: 'finance', label: 'Finance' },
  { id: 'schemes', label: 'Schemes' },
  { id: 'medicine', label: 'Medicine' },
  { id: 'machinery', label: 'Machinery' },
  { id: 'utilities', label: 'Utilities' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'farms', label: 'Farms' },
  { id: 'links', label: 'Links' },
  { id: 'assistant', label: 'AI' },
  { id: 'settings', label: 'Settings' },
];

export default function Nav({ section, onSection }: { section: Section; onSection: (s: Section) => void }) {
  return (
    <div className="nav">
      {TABS.map(tab => (
        <button key={tab.id} className={`nav-btn${section === tab.id ? ' active' : ''}`} onClick={() => onSection(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
