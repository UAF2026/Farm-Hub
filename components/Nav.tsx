'use client';

import { Section } from './FarmHub';

// Tabs are grouped so the top bar shows six sections instead of 30 tabs.
// The second row shows the tabs inside the open section.
export const GROUPS: { id: string; label: string; tabs: { id: Section; label: string }[] }[] = [
  {
    id: 'today', label: 'Today', tabs: [
      { id: 'myday', label: 'My day' },
      { id: 'farmyear', label: 'Farm year' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'weather', label: 'Weather' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'diary', label: 'Diary' },
      { id: 'braindump', label: 'Brain Dump' },
      { id: 'assistant', label: 'Ask AI' },
    ],
  },
  {
    id: 'fields', label: 'Fields & crops', tabs: [
      { id: 'fields', label: 'Fields' },
      { id: 'croppingplan', label: 'Cropping Plan' },
      { id: 'map', label: 'Map' },
      { id: 'agronomy', label: 'Agronomy recs' },
      { id: 'fieldrecords', label: 'Spray & fert records' },
      { id: 'johndeere', label: 'John Deere' },
      { id: 'soilhealth', label: 'Soil' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'crops', label: 'Old field list' },
    ],
  },
  {
    id: 'livestock', label: 'Livestock', tabs: [
      { id: 'livestock', label: 'Cattle' },
      { id: 'medicine', label: 'Medicine' },
    ],
  },
  {
    id: 'money', label: 'Money', tabs: [
      { id: 'finance', label: 'Finance' },
      { id: 'cropmargins', label: 'Crop margins' },
      { id: 'costings', label: 'Budget' },
      { id: 'graintrading', label: 'Grain sales' },
      { id: 'purchases', label: 'Purchases' },
      { id: 'schemes', label: 'Schemes' },
    ],
  },
  {
    id: 'compliance', label: 'Compliance', tabs: [
      { id: 'compliance', label: 'Compliance' },
      { id: 'assurance', label: 'Audit day' },
    ],
  },
  {
    id: 'business', label: 'The business', tabs: [
      { id: 'strategy', label: 'Strategy' },
      { id: 'farmbible', label: 'Farm Bible' },
      { id: 'farms', label: 'Land' },
      { id: 'utilities', label: 'Contracts' },
      { id: 'machinery', label: 'Machinery' },
      { id: 'links', label: 'Links' },
    ],
  },
  {
    // Private investments: kept out of the farm accounts.
    id: 'private', label: 'Private', tabs: [
      { id: 'property', label: '8 Netherton Rd' },
    ],
  },
];

export const ALL_SECTIONS: Section[] = [...GROUPS.flatMap(g => g.tabs.map(t => t.id)), 'settings'];

export function groupOf(section: Section) {
  return GROUPS.find(g => g.tabs.some(t => t.id === section));
}

export default function Nav({ section, onSection, lastInGroup }: {
  section: Section;
  onSection: (s: Section) => void;
  lastInGroup: Record<string, Section>;
}) {
  const group = groupOf(section);
  return (
    <nav aria-label="Sections">
      <div className="nav nav-groups">
        {GROUPS.map(g => (
          <button
            key={g.id}
            className={`nav-group${group?.id === g.id ? ' active' : ''}`}
            onClick={() => onSection(lastInGroup[g.id] || g.tabs[0].id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      {group && group.tabs.length > 1 && (
        <div className="nav">
          {group.tabs.map(tab => (
            <button key={tab.id} className={`nav-btn${section === tab.id ? ' active' : ''}`} onClick={() => onSection(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
