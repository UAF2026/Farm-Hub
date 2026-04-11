'use client';

import { useState } from 'react';
import { FarmData } from '@/lib/types';
import type { Task } from '@/lib/types';
import { fmtDate, uid } from '@/lib/utils';

interface Props { db: FarmData; persist: (db: FarmData) => void; addActivity: (msg: string) => void; }

const CATEGORIES = ['Livestock', 'Crops', 'Machinery', 'Buildings', 'Finance', 'Compliance', 'General'];
const CAT_COL: Record<string, string> = { Livestock: 'bg-green', Crops: 'bg-amber', Machinery: 'bg-gray', Buildings: 'bg-gray', Finance: 'bg-blue', Compliance: 'bg-red', General: 'bg-gray' };

export default function Tasks({ db, persist, addActivity }: Props) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [category, setCategory] = useState('General');
  const [repeat, setRepeat] = useState('No repeat');
  const [notes, setNotes] = useState('');

  const tasks = db.tasks || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);
  const ago14 = new Date(today); ago14.setDate(today.getDate() - 14);

  const active = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done && t.doneDate && new Date(t.doneDate + 'T12:00:00') >= ago14);
  const overdue = active.filter(t => t.date && new Date(t.date + 'T12:00:00') < today);
  const soon = active.filter(t => t.date && new Date(t.date + 'T12:00:00') >= today && new Date(t.date + 'T12:00:00') <= in7);
  const upcoming = active.filter(t => !t.date || new Date(t.date + 'T12:00:00') > in7);

  function saveTask() {
    if (!name.trim()) return alert('Please enter a task description.');
    const task: Task = { id: uid(), name: name.trim(), date, priority, category, repeat, notes, done: false, doneDate: null };
    addActivity('Added task: ' + task.name);
    persist({ ...db, tasks: [...tasks, task] });
    setModal(false); setName(''); setDate(''); setNotes('');
  }

  function completeTask(id: string) {
    const newTasks = tasks.map(t => {
      if (t.id !== id) return t;
      if (t.repeat && t.repeat !== 'No repeat' && t.date) {
        const d = new Date(t.date + 'T12:00:00');
        if (t.repeat === 'Daily') d.setDate(d.getDate() + 1);
        else if (t.repeat === 'Weekly') d.setDate(d.getDate() + 7);
        else if (t.repeat === 'Monthly') d.setMonth(d.getMonth() + 1);
        else if (t.repeat === 'Annually') d.setFullYear(d.getFullYear() + 1);
        addActivity('Completed & rescheduled: ' + t.name);
        return { ...t, date: d.toISOString().slice(0, 10) };
      }
      addActivity('Completed: ' + t.name);
      return { ...t, done: true, doneDate: new Date().toISOString().slice(0, 10) };
    });
    persist({ ...db, tasks: newTasks });
  }

  function deleteTask(id: string) {
    if (!confirm('Remove this task?')) return;
    persist({ ...db, tasks: tasks.filter(t => t.id !== id) });
  }

  function TaskRow({ t }: { t: Task }) {
    return (
      <div className="row-item">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-name">
            {t.name}
            {t.repeat && t.repeat !== 'No repeat' && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 5 }}>↻ {t.repeat}</span>}
          </div>
          <div className="row-sub">{t.date ? fmtDate(t.date) : 'No date'}{t.notes ? ' · ' + t.notes : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <span className={`badge ${CAT_COL[t.category] || 'bg-gray'}`} style={{ fontSize: 10 }}>{t.category}</span>
          <button className="done-btn" onClick={() => completeTask(t.id)}>Done</button>
          <button className="del-btn" onClick={() => deleteTask(t.id)}>×</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button className="btn-add" onClick={() => setModal(true)} style={{ marginBottom: '1rem' }}>+ Add task</button>

      <div className="card" style={{ borderLeft: '4px solid var(--red)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
        <div className="card-title" style={{ color: 'var(--red)' }}>Overdue</div>
        {overdue.length === 0 ? <div className="empty">Nothing overdue.</div> : overdue.map(t => <TaskRow key={t.id} t={t} />)}
      </div>

      <div className="card" style={{ borderLeft: '4px solid var(--amber)', borderRadius: '0 var(--radius-lg) var(--radius-lg) 0' }}>
        <div className="card-title" style={{ color: 'var(--amber)' }}>Today &amp; next 7 days</div>
        {soon.length === 0 ? <div className="empty">Nothing coming up.</div> : soon.map(t => <TaskRow key={t.id} t={t} />)}
      </div>

      <div className="card">
        <div className="card-title">All upcoming tasks</div>
        {upcoming.length === 0 ? <div className="empty">No tasks added yet.</div> : upcoming.map(t => <TaskRow key={t.id} t={t} />)}
      </div>

      <div className="card">
        <div className="card-title">Completed (last 14 days)</div>
        {done.length === 0 ? <div className="empty">No completed tasks yet.</div> : done.map(t => (
          <div key={t.id} className="row-item">
            <div style={{ flex: 1 }}>
              <div className="row-name" style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: 13 }}>{t.name}</div>
              <div className="row-sub">Completed {fmtDate(t.doneDate || '')}</div>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="modal-box">
            <div className="modal-title">Add task</div>
            <label className="form-label">Task description</label>
            <input placeholder="e.g. Check water troughs, service sprayer" value={name} onChange={e => setName(e.target.value)} />
            <div className="field-row">
              <div><label className="form-label">Due date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><label className="form-label">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as any)}>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div><label className="form-label">Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="form-label">Repeat</label>
                <select value={repeat} onChange={e => setRepeat(e.target.value)}>
                  <option>No repeat</option><option>Daily</option><option>Weekly</option><option>Monthly</option><option>Annually</option>
                </select>
              </div>
            </div>
            <label className="form-label">Notes</label>
            <input placeholder="Additional details..." value={notes} onChange={e => setNotes(e.target.value)} />
            <div className="modal-btns">
              <button className="btn-cancel" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveTask}>Save task</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
