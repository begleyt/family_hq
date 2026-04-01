import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import {
  ChevronLeft, ChevronRight, Plus, X, ExternalLink, Trash2,
  Settings, Link2, Unlink, MapPin, Clock, CalendarDays
} from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const COLOR_OPTIONS = [
  { name: 'Blue', value: 'blue', classes: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800', dot: 'bg-blue-500' },
  { name: 'Green', value: 'green', classes: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-500' },
  { name: 'Purple', value: 'purple', classes: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800', dot: 'bg-purple-500' },
  { name: 'Orange', value: 'orange', classes: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800', dot: 'bg-orange-500' },
  { name: 'Pink', value: 'pink', classes: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800', dot: 'bg-pink-500' },
  { name: 'Red', value: 'red', classes: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800', dot: 'bg-red-500' },
  { name: 'Yellow', value: 'yellow', classes: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800', dot: 'bg-yellow-500' },
  { name: 'Teal', value: 'teal', classes: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800', dot: 'bg-teal-500' },
  { name: 'Gray', value: 'gray', classes: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600', dot: 'bg-slate-500' },
];

const DEFAULT_COLOR = COLOR_OPTIONS[0];

function loadNameColors() {
  try {
    return JSON.parse(localStorage.getItem('family_calendar_colors') || '[]');
  } catch { return []; }
}

function saveNameColors(colors) {
  localStorage.setItem('family_calendar_colors', JSON.stringify(colors));
}

function formatTime(dateStr) {
  if (!dateStr || !dateStr.includes('T')) return '';
  return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CalendarPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [weekMeals, setWeekMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState({ configured: false, connected: false });

  // Name-to-color mapping
  const [nameColors, setNameColors] = useState(loadNameColors);
  const [showColorConfig, setShowColorConfig] = useState(false);
  const [newColorName, setNewColorName] = useState('');
  const [newColorValue, setNewColorValue] = useState('blue');

  // Auto-detect names from event titles and assign consistent colors
  const getNameFromTitle = (title) => {
    const t = (title || '').toLowerCase();
    // First check manual color rules
    for (const nc of nameColors) {
      if (t.includes(nc.name.toLowerCase())) return nc.name.toLowerCase();
    }
    // Auto-detect: use first word before common separators (-, :, @)
    const match = t.match(/^([a-z]+)[\s\-:]/);
    if (match && match[1].length >= 2) return match[1];
    // Fallback: hash the whole title
    return t;
  };

  const getEventColor = (ev) => {
    const title = (ev.title || '').toLowerCase();
    // Check manual rules first
    for (const nc of nameColors) {
      if (title.includes(nc.name.toLowerCase())) {
        return COLOR_OPTIONS.find(c => c.value === nc.color)?.classes || DEFAULT_COLOR.classes;
      }
    }
    // Auto-assign by name/keyword — consistent hash-based color
    const name = getNameFromTitle(ev.title);
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
    return COLOR_OPTIONS[Math.abs(hash) % COLOR_OPTIONS.length].classes;
  };

  const addNameColor = () => {
    if (!newColorName.trim()) return;
    const updated = [...nameColors.filter(nc => nc.name.toLowerCase() !== newColorName.toLowerCase()), { name: newColorName.trim(), color: newColorValue }];
    setNameColors(updated);
    saveNameColors(updated);
    setNewColorName('');
  };

  const removeNameColor = (name) => {
    const updated = nameColors.filter(nc => nc.name !== name);
    setNameColors(updated);
    saveNameColors(updated);
  };

  // Config modal
  const [showConfig, setShowConfig] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [calendarId, setCalendarId] = useState('primary');
  const [redirectUri, setRedirectUri] = useState('');

  // Create event modal
  const [showCreate, setShowCreate] = useState(null); // null or { date: 'YYYY-MM-DD' }
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventStartDate, setEventStartDate] = useState('');
  const [eventStartTime, setEventStartTime] = useState('09:00');
  const [eventEndTime, setEventEndTime] = useState('10:00');
  const [eventAllDay, setEventAllDay] = useState(false);
  const [creating, setCreating] = useState(false);

  // Event detail
  const [selectedEvent, setSelectedEvent] = useState(null);

  // View mode
  const [view, setView] = useState('week'); // 'month' or 'week'

  useEffect(() => {
    api.get('/calendar/status').then(res => setStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!status.connected) { setLoading(false); return; }
    fetchEvents();
  }, [currentDate, status.connected]);

  const fetchEvents = async () => {
    setLoading(true);
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const timeMin = new Date(year, month - 1, 1).toISOString();
    const timeMax = new Date(year, month + 2, 0).toISOString();
    try {
      const res = await api.get(`/calendar/events?timeMin=${timeMin}&timeMax=${timeMax}`);
      setEvents(res.data.events || []);
    } catch (e) {}
    setLoading(false);
  };

  const fetchWeekMeals = async () => {
    const start = getWeekStart();
    const weekStr = start.toISOString().split('T')[0];
    try {
      const res = await api.get(`/meals?week=${weekStr}`);
      setWeekMeals(res.data.meals || []);
    } catch (e) {}
  };

  useEffect(() => { fetchWeekMeals(); }, [currentDate]);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Month calendar grid
  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();

    const days = [];
    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevDays - i), isCurrentMonth: false });
    }
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  };

  const getEventsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => {
      const eDate = (e.start || '').split('T')[0];
      return eDate === dateStr;
    });
  };

  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  };

  const formatDateStr = (d) => d.toISOString().split('T')[0];

  // Week view helpers
  const getWeekStart = () => {
    const d = new Date(currentDate);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  };

  const getWeekDays = () => {
    const start = getWeekStart();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const prevWeek = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
  const nextWeek = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));

  // Config handlers
  const saveConfig = async () => {
    await api.put('/calendar/config', { clientId, clientSecret, redirectUri, calendarId });
    setShowConfig(false);
    const res = await api.get('/calendar/status');
    setStatus(res.data);
  };

  const connectGoogle = async () => {
    const res = await api.get('/calendar/auth-url');
    // Full redirect — no popup, avoids cross-origin issues
    window.location.href = res.data.url;
  };

  const handleAuthCode = async (code) => {
    try {
      await api.post('/calendar/callback', { code });
      const res = await api.get('/calendar/status');
      setStatus(res.data);
      fetchEvents();
    } catch (e) {
      alert('Failed to connect: ' + (e.response?.data?.error || e.message));
    }
  };

  const disconnect = async () => {
    await api.post('/calendar/disconnect');
    setStatus({ ...status, connected: false });
    setEvents([]);
  };

  // Create event
  const openCreate = (dateStr) => {
    setEventTitle(''); setEventDesc(''); setEventLocation('');
    setEventStartDate(dateStr); setEventStartTime('09:00'); setEventEndTime('10:00');
    setEventAllDay(false);
    setShowCreate({ date: dateStr });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;
    setCreating(true);
    try {
      await api.post('/calendar/events', {
        title: eventTitle, description: eventDesc, location: eventLocation,
        startDate: eventStartDate, startTime: eventStartTime,
        endDate: eventStartDate, endTime: eventEndTime, allDay: eventAllDay,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setShowCreate(null);
      fetchEvents();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to create event');
    } finally { setCreating(false); }
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm('Delete this event from Google Calendar?')) return;
    await api.delete(`/calendar/events/${eventId}`);
    setSelectedEvent(null);
    fetchEvents();
  };

  const monthDays = getMonthDays();

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Calendar</h1>
        <div className="flex items-center gap-2">
          {isParent && (
            <button onClick={() => setShowColorConfig(true)} className="btn-secondary text-sm flex items-center gap-1">
              {'\u{1F3A8}'} Colors
            </button>
          )}
          {isParent && (
            <button onClick={() => setShowConfig(true)} className="btn-secondary text-sm flex items-center gap-1">
              <Settings size={14} /> Setup
            </button>
          )}
          {isParent && status.configured && !status.connected && (
            <button onClick={connectGoogle} className="btn-primary text-sm flex items-center gap-1">
              <Link2 size={14} /> Connect Google
            </button>
          )}
          {isParent && status.connected && (
            <button onClick={disconnect} className="btn-secondary text-sm flex items-center gap-1 text-red-500">
              <Unlink size={14} /> Disconnect
            </button>
          )}
        </div>
      </div>

      {!status.configured && isParent && (
        <div className="card mb-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Google Calendar not configured yet</p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Click Setup to enter your Google OAuth credentials</p>
        </div>
      )}

      {status.configured && !status.connected && !isParent && (
        <div className="card mb-4 text-center py-8">
          <CalendarDays size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">Calendar not connected yet</p>
          <p className="text-xs text-slate-400 mt-1">Ask a parent to connect Google Calendar</p>
        </div>
      )}

      {/* Navigation */}
      {(status.connected || !status.configured) && (
        <div className="flex items-center justify-between mb-4 card py-3">
          <button onClick={view === 'month' ? prevMonth : prevWeek} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronLeft size={20} /></button>
          <div className="text-center">
            <p className="font-bold text-lg">
              {view === 'month'
                ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                : (() => {
                    const wd = getWeekDays();
                    return `${wd[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${wd[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                  })()
              }
            </p>
            <div className="flex items-center justify-center gap-3 mt-1">
              <button onClick={goToday} className="text-xs text-family-500 hover:text-family-600">Today</button>
              <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-0.5">
                <button onClick={() => setView('week')}
                  className={`text-xs px-3 py-1 rounded-md transition-all ${view === 'week' ? 'bg-white dark:bg-slate-600 shadow-sm font-medium' : 'text-slate-500'}`}>Week</button>
                <button onClick={() => setView('month')}
                  className={`text-xs px-3 py-1 rounded-md transition-all ${view === 'month' ? 'bg-white dark:bg-slate-600 shadow-sm font-medium' : 'text-slate-500'}`}>Month</button>
              </div>
            </div>
          </div>
          <button onClick={view === 'month' ? nextMonth : nextWeek} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700"><ChevronRight size={20} /></button>
        </div>
      )}

      {/* Month View */}
      {status.connected && view === 'month' && (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-600">
            {DAYS.map(d => (
              <div key={d} className="p-2 text-center text-xs font-semibold text-slate-400 uppercase">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map(({ date, isCurrentMonth }, i) => {
              const dayEvents = getEventsForDate(date);
              const dateStr = formatDateStr(date);
              const today = isToday(date);
              return (
                <div key={i}
                  onClick={() => isParent && !isDashboard ? openCreate(dateStr) : null}
                  className={`min-h-[90px] md:min-h-[110px] p-1.5 border-b border-r border-slate-100 dark:border-slate-700 transition-colors
                    ${!isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-800/50' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}
                    ${isParent && !isDashboard ? 'cursor-pointer' : ''}
                  `}>
                  <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full
                    ${today ? 'bg-family-500 text-white' : isCurrentMonth ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300 dark:text-slate-600'}
                  `}>{date.getDate()}</div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map(ev => (
                      <div key={ev.id} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                        className={`text-[11px] px-1.5 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 ${getEventColor(ev)}`}>
                        {!ev.allDay && <span className="font-medium">{formatTime(ev.start)} </span>}{ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && <p className="text-[10px] text-slate-400 pl-1">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {status.connected && view === 'week' && (
        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-600">
            {getWeekDays().map((day, i) => {
              const today = isToday(day);
              return (
                <div key={i} className={`p-3 text-center border-r last:border-r-0 border-slate-100 dark:border-slate-700 ${today ? 'bg-family-50 dark:bg-family-900/30' : ''}`}>
                  <p className={`text-xs font-semibold uppercase ${today ? 'text-family-600' : 'text-slate-400'}`}>{DAYS[day.getDay()]}</p>
                  <p className={`text-xl font-bold ${today ? 'text-family-600' : ''}`}>{day.getDate()}</p>
                  <p className="text-[11px] text-slate-400">{day.toLocaleDateString('en-US', { month: 'short' })}</p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-7">
            {getWeekDays().map((day, i) => {
              const dayEvents = getEventsForDate(day);
              const dateStr = formatDateStr(day);
              const today = isToday(day);
              return (
                <div key={i}
                  onClick={() => isParent && !isDashboard ? openCreate(dateStr) : null}
                  className={`min-h-[200px] p-2 border-r last:border-r-0 border-slate-100 dark:border-slate-700 ${today ? 'bg-family-50/20 dark:bg-family-900/10' : ''} ${isParent && !isDashboard ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30' : ''}`}>
                  <div className="space-y-1.5">
                    {dayEvents.map(ev => (
                      <div key={ev.id} onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                        className={`text-xs px-2 py-1.5 rounded-lg border cursor-pointer hover:opacity-80 ${getEventColor(ev)}`}>
                        <p className="font-medium">{ev.title}</p>
                        <p className="text-[10px] opacity-75 mt-0.5">
                          {ev.allDay ? 'All day' : formatTime(ev.start)}
                          {ev.location && ` \u{00B7} ${ev.location}`}
                        </p>
                      </div>
                    ))}
                    {dayEvents.length === 0 && isParent && !isDashboard && (
                      <p className="text-xs text-slate-300 dark:text-slate-600 text-center mt-8">+ Add</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && status.connected && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" />
        </div>
      )}

      {/* Week Meals */}
      {weekMeals.length > 0 && (
        <div className="mt-4 card">
          <h2 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
            {'\u{1F37D}\u{FE0F}'} This Week's Meals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {(() => {
              const days = getWeekDays();
              const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              const MEAL_EMOJI = { breakfast: '\u{1F373}', lunch: '\u{1F96A}', dinner: '\u{1F35D}', snack: '\u{1F34E}' };
              return days.map((day, i) => {
                const dateStr = day.toISOString().split('T')[0];
                const dayMeals = weekMeals.filter(m => m.meal_date === dateStr);
                if (dayMeals.length === 0) return null;
                const today = isToday(day);
                return (
                  <div key={i} className={`rounded-xl p-2.5 ${today ? 'bg-family-50 dark:bg-family-900/20 border border-family-200 dark:border-family-800' : 'bg-slate-50 dark:bg-slate-700'}`}>
                    <p className={`text-xs font-semibold mb-1.5 ${today ? 'text-family-600' : 'text-slate-500'}`}>
                      {DAYS_SHORT[day.getDay()]} {day.getDate()}
                    </p>
                    <div className="space-y-1">
                      {dayMeals.map(m => (
                        <div key={m.id} className="flex items-center gap-1.5">
                          <span className="text-xs">{MEAL_EMOJI[m.meal_type] || '\u{1F37D}'}</span>
                          <span className="text-xs text-slate-700 dark:text-slate-200 truncate">{m.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }).filter(Boolean);
            })()}
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowConfig(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Google Calendar Setup</h2>
              <button onClick={() => setShowConfig(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p className="font-semibold">Setup Instructions:</p>
                <p>1. Go to console.cloud.google.com</p>
                <p>2. Create a project, enable Google Calendar API</p>
                <p>3. Create OAuth 2.0 credentials (Web application)</p>
                <p>4. Set redirect URI to your portal URL + <code>/calendar-callback</code></p>
                <p>5. Copy Client ID and Secret below</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Client ID</label>
                <input value={clientId} onChange={e => setClientId(e.target.value)} className="input-field text-sm" placeholder="xxxx.apps.googleusercontent.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Client Secret</label>
                <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} className="input-field text-sm" type="password" placeholder="GOCSPX-..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Redirect URI</label>
                <input value={redirectUri} onChange={e => setRedirectUri(e.target.value)} className="input-field text-sm"
                  placeholder={window.location.origin + '/calendar-callback'} />
                <p className="text-xs text-slate-400 mt-1">Must match exactly in Google Console. Use: {window.location.origin}/calendar-callback</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Calendar ID (optional)</label>
                <input value={calendarId} onChange={e => setCalendarId(e.target.value)} className="input-field text-sm" placeholder="primary" />
                <p className="text-xs text-slate-400 mt-1">Use "primary" for your main calendar, or a specific calendar ID</p>
              </div>
              <button onClick={saveConfig} className="btn-primary w-full">Save Configuration</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCreate(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">New Event</h2>
              <button onClick={() => setShowCreate(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Event Title</label>
                <input value={eventTitle} onChange={e => setEventTitle(e.target.value)} className="input-field" placeholder="e.g., Family Dinner" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Date</label>
                <input type="date" value={eventStartDate} onChange={e => setEventStartDate(e.target.value)} className="input-field" required />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={eventAllDay} onChange={e => setEventAllDay(e.target.checked)} className="rounded" />
                  All day event
                </label>
              </div>
              {!eventAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Start Time</label>
                    <input type="time" value={eventStartTime} onChange={e => setEventStartTime(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">End Time</label>
                    <input type="time" value={eventEndTime} onChange={e => setEventEndTime(e.target.value)} className="input-field" />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Location (optional)</label>
                <input value={eventLocation} onChange={e => setEventLocation(e.target.value)} className="input-field" placeholder="e.g., Home" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Description (optional)</label>
                <textarea value={eventDesc} onChange={e => setEventDesc(e.target.value)} className="input-field min-h-[60px] resize-none" placeholder="Notes..." />
              </div>
              <button type="submit" disabled={creating} className="btn-primary w-full">
                {creating ? 'Creating...' : 'Create Event'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setSelectedEvent(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 z-50">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{selectedEvent.title}</h2>
              <button onClick={() => setSelectedEvent(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Clock size={16} />
                {selectedEvent.allDay ? (
                  <span>{new Date(selectedEvent.start).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} (All day)</span>
                ) : (
                  <span>
                    {new Date(selectedEvent.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                    {formatTime(selectedEvent.start)} - {formatTime(selectedEvent.end)}
                  </span>
                )}
              </div>
              {selectedEvent.location && (
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <MapPin size={16} /> {selectedEvent.location}
                </div>
              )}
              {selectedEvent.description && (
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{selectedEvent.description}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {selectedEvent.htmlLink && (
                  <a href={selectedEvent.htmlLink} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 text-sm flex items-center justify-center gap-1">
                    <ExternalLink size={14} /> Open in Google
                  </a>
                )}
                {isParent && (
                  <button onClick={() => handleDelete(selectedEvent.id)} className="btn-danger flex-1 text-sm flex items-center justify-center gap-1">
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Name Color Config Modal */}
      {showColorConfig && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowColorConfig(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Event Color Coding</h2>
              <button onClick={() => setShowColorConfig(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">Events with a name in the title will be color-coded automatically.</p>

            {/* Current mappings */}
            {nameColors.length > 0 && (
              <div className="space-y-2 mb-4">
                {nameColors.map(nc => {
                  const colorOpt = COLOR_OPTIONS.find(c => c.value === nc.color) || DEFAULT_COLOR;
                  return (
                    <div key={nc.name} className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-700 rounded-xl">
                      <div className={`w-4 h-4 rounded-full ${colorOpt.dot}`} />
                      <span className="text-sm font-medium flex-1">{nc.name}</span>
                      <span className={`badge ${colorOpt.classes}`}>{colorOpt.name}</span>
                      <button onClick={() => removeNameColor(nc.name)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new */}
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Name</label>
                <input value={newColorName} onChange={e => setNewColorName(e.target.value)}
                  className="input-field text-sm" placeholder="e.g., Izzy, Soccer, School" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button key={c.value} onClick={() => setNewColorValue(c.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-all ${
                        newColorValue === c.value ? 'ring-2 ring-offset-1 ring-family-400 ' + c.classes : 'border-transparent ' + c.classes
                      }`}>
                      <div className={`w-3 h-3 rounded-full ${c.dot}`} /> {c.name}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={addNameColor} className="btn-primary w-full text-sm">Add Color Rule</button>
            </div>

            <p className="text-xs text-slate-400 mt-4">
              Tip: Use first names, activity names (Soccer, Piano), or keywords. If an event title contains the name, it gets that color.
              The first matching rule wins.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
