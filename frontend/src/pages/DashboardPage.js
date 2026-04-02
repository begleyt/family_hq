import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import Avatar from '../components/common/Avatar';
import {
  Ticket, ShoppingCart, UtensilsCrossed, Users, Clock, CalendarDays, Camera,
  AlertCircle, ChevronRight, MessageCircle, Send, Pin, MapPin, BarChart3, Image,
  Trash2, Edit, X, ChevronDown, ChevronUp, GripVertical
} from 'lucide-react';

// Event color coding (same as CalendarPage)
const EVENT_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800',
  'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800',
  'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800',
  'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800',
  'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/40 dark:text-pink-300 dark:border-pink-800',
  'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800',
  'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800',
  'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/40 dark:text-teal-300 dark:border-teal-800',
  'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600',
];

function getEventColor(title) {
  const t = (title || '').toLowerCase();
  // Check manual color rules from localStorage
  try {
    const rules = JSON.parse(localStorage.getItem('family_calendar_colors') || '[]');
    for (const r of rules) {
      if (t.includes(r.name.toLowerCase())) {
        const colorMap = { blue: 0, green: 1, purple: 2, orange: 3, pink: 4, red: 5, yellow: 6, teal: 7, gray: 8 };
        return EVENT_COLORS[colorMap[r.color] ?? 0];
      }
    }
  } catch (e) {}
  // Auto by first word
  const match = t.match(/^([a-z]+)[\s\-:]/);
  const name = match ? match[1] : t;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

const CATEGORY_EMOJI = {
  fix_something: '\u{1F527}', buy_something: '\u{1F6D2}', permission: '\u{1F511}',
  chore_negotiation: '\u{1F91D}', allowance: '\u{1F4B0}', ride_request: '\u{1F697}',
  tech_request: '\u{1F4F1}', grocery_item: '\u{1F6D2}', meal_request: '\u{1F35D}', other: '\u{1F4CB}'
};

const STATUS_STYLE = {
  open: 'bg-amber-100 text-amber-700', in_progress: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700', denied: 'bg-red-100 text-red-700',
  completed: 'bg-slate-100 text-slate-600',
};

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Message board state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [expandedMsg, setExpandedMsg] = useState(null);
  const [msgComments, setMsgComments] = useState({});
  const [newComment, setNewComment] = useState('');
  const [editingMsg, setEditingMsg] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [todayEvents, setTodayEvents] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [activePolls, setActivePolls] = useState([]);
  const photoInputRef = React.useRef(null);

  useEffect(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

    Promise.all([
      api.get('/dashboard'),
      api.get('/messages'),
      api.get(`/calendar/events?timeMin=${todayStart}&timeMax=${todayEnd}`).catch(() => ({ data: { events: [] } })),
      api.get('/polls?status=open').catch(() => ({ data: [] }))
    ]).then(([dashRes, msgRes, calRes, pollRes]) => {
      setData(dashRes.data);
      setMessages(msgRes.data);
      setTodayEvents(calRes.data.events || []);
      setActivePolls(Array.isArray(pollRes.data) ? pollRes.data : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const fetchMessages = () => api.get('/messages').then(res => setMessages(res.data));

  const compressImage = (file, maxWidth = 1600, quality = 0.7) => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Compress before setting — shrinks 5MB phone photos to ~200-400KB
    const compressed = await compressImage(file);
    setPhotoFile(compressed);
    setPhotoPreview(URL.createObjectURL(compressed));
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const postMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !photoFile) return;
    setPosting(true);
    try {
      if (photoFile) {
        const formData = new FormData();
        formData.append('content', newMessage);
        formData.append('photo', photoFile);
        await api.post('/messages', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/messages', { content: newMessage });
      }
      setNewMessage('');
      clearPhoto();
      fetchMessages();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to post');
    } finally { setPosting(false); }
  };

  const deleteMessage = async (id) => {
    await api.delete(`/messages/${id}`);
    fetchMessages();
  };

  const togglePin = async (msg) => {
    await api.put(`/messages/${msg.id}`, { pinned: !msg.pinned });
    fetchMessages();
  };

  const startEdit = (msg) => { setEditingMsg(msg.id); setEditContent(msg.content); };
  const saveEdit = async () => {
    await api.put(`/messages/${editingMsg}`, { content: editContent });
    setEditingMsg(null); setEditContent('');
    fetchMessages();
  };

  const toggleComments = async (id) => {
    if (expandedMsg === id) { setExpandedMsg(null); return; }
    const res = await api.get(`/messages/${id}`);
    setMsgComments(prev => ({ ...prev, [id]: res.data.comments }));
    setExpandedMsg(id);
  };

  const postComment = async (e, msgId) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    await api.post(`/messages/${msgId}/comments`, { content: newComment });
    setNewComment('');
    const res = await api.get(`/messages/${msgId}`);
    setMsgComments(prev => ({ ...prev, [msgId]: res.data.comments }));
    fetchMessages();
  };

  const handleDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image slightly transparent
    if (e.target) e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = '1';
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id !== dragOverId) setDragOverId(id);
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const fromIndex = messages.findIndex(m => m.id === dragId);
    const toIndex = messages.findIndex(m => m.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...messages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setMessages(reordered);
    setDragId(null);
    setDragOverId(null);
    const order = reordered.map((m, i) => ({ id: m.id, sort_order: i }));
    await api.put('/messages', { order });
  };

  const deleteComment = async (msgId, commentId) => {
    await api.delete(`/messages/${msgId}/comments/${commentId}`);
    const res = await api.get(`/messages/${msgId}`);
    setMsgComments(prev => ({ ...prev, [msgId]: res.data.comments }));
    fetchMessages();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;
  if (!data) return <div className="text-center text-slate-400 mt-12">Failed to load dashboard</div>;

  const { stats, todayMeals, recentActivity, pendingRequests } = data;
  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hey, {user.displayName}! {user.avatarEmoji}</h1>
          <p className="text-slate-500 text-sm mt-0.5">Here's what's happening at home</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><Ticket size={20} className="text-amber-600" /></div>
          <div><p className="text-2xl font-bold">{stats.openRequests}</p><p className="text-xs text-slate-500">Open Requests</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><ShoppingCart size={20} className="text-emerald-600" /></div>
          <div><p className="text-2xl font-bold">{stats.groceryTotal}</p><p className="text-xs text-slate-500">Grocery Items</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><UtensilsCrossed size={20} className="text-blue-600" /></div>
          <div><p className="text-2xl font-bold">{stats.todayMealCount}</p><p className="text-xs text-slate-500">Today's Meals</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-family-100 flex items-center justify-center"><Users size={20} className="text-family-600" /></div>
          <div><p className="text-2xl font-bold">{stats.familyCount}</p><p className="text-xs text-slate-500">Family Members</p></div>
        </div>
      </div>

      {/* Message Board */}
      {(() => {
        const noteColors = [
          'bg-yellow-100 border-yellow-200', 'bg-blue-100 border-blue-200',
          'bg-pink-100 border-pink-200', 'bg-green-100 border-green-200',
          'bg-purple-100 border-purple-200', 'bg-orange-100 border-orange-200',
        ];
        const getNoteColor = (id) => noteColors[id % noteColors.length];
        const rotations = ['-rotate-1', 'rotate-1', '-rotate-[0.5deg]', 'rotate-[0.5deg]', '-rotate-[1.5deg]', 'rotate-[1.5deg]'];
        const getRotation = (id) => rotations[id % rotations.length];

        return (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                <MessageCircle size={18} className="text-family-500" /> Family Message Board
              </h2>
            </div>

            {/* Post new message */}
            {!isDashboard && (
              <div className="mb-4">
                <form onSubmit={postMessage} className="flex gap-2">
                  <input value={newMessage} onChange={e => setNewMessage(e.target.value)}
                    className="input-field flex-1 text-sm" placeholder="Pin a note to the board..." />
                  <input ref={photoInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    className={`btn-secondary px-3 ${photoFile ? 'ring-2 ring-family-400' : ''}`}>
                    <Camera size={16} />
                  </button>
                  <button type="submit" disabled={posting} className="btn-primary px-3">
                    {posting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
                {photoPreview && (
                  <div className="mt-2 relative inline-block">
                    <img src={photoPreview} alt="Preview" className="h-20 rounded-lg border border-slate-200" />
                    <button onClick={clearPhoto} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sticky note grid */}
            {messages.length === 0 ? (
              <div className="card text-center py-8">
                <p className="text-slate-400 text-sm">The board is empty. Post the first note!</p>
              </div>
            ) : (<>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {(showAllMessages ? messages : messages.slice(0, 3)).map((msg, i) => (
                  <div key={msg.id}
                    draggable={isParent}
                    onDragStart={isParent ? (e) => handleDragStart(e, msg.id) : undefined}
                    onDragEnd={isParent ? handleDragEnd : undefined}
                    onDragOver={isParent ? (e) => handleDragOver(e, msg.id) : undefined}
                    onDrop={isParent ? (e) => handleDrop(e, msg.id) : undefined}
                    className={`${getNoteColor(msg.id)} ${getRotation(msg.id)} border-2 rounded-lg p-4 shadow-md hover:shadow-lg hover:rotate-0 transition-all cursor-pointer relative ${
                      dragOverId === msg.id && dragId !== msg.id ? 'ring-2 ring-family-400 scale-105' : ''
                    } ${dragId === msg.id ? 'opacity-50' : ''}`}
                    style={{ minHeight: '120px' }}
                    onClick={() => { if (expandedMsg !== msg.id) toggleComments(msg.id); }}>

                    {/* Pin icon for pinned messages */}
                    {!!msg.pinned && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <div className="w-5 h-5 bg-red-400 rounded-full border-2 border-red-500 shadow-sm" />
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mb-2">
                      {isParent && (
                        <GripVertical size={14} className="text-slate-400 cursor-grab active:cursor-grabbing shrink-0 -ml-1" />
                      )}
                      <Avatar url={msg.avatar_url} emoji={msg.avatar_emoji} color={msg.avatar_color} size="md" />
                      <span className="text-sm font-bold text-slate-700">{msg.display_name}</span>
                    </div>

                    {editingMsg === msg.id ? (
                      <div className="space-y-2" onClick={e => e.stopPropagation()}>
                        <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                          className="w-full bg-white/50 rounded p-1.5 text-sm border-0 outline-none resize-none" rows={3} />
                        <div className="flex gap-1">
                          <button onClick={saveEdit} className="bg-white/70 rounded px-2 py-1 text-xs font-medium hover:bg-white">Save</button>
                          <button onClick={() => setEditingMsg(null)} className="bg-white/40 rounded px-2 py-1 text-xs hover:bg-white/60">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {msg.image_asset_id && (
                          <img src={`/api/messages/immich-proxy/${msg.image_asset_id}/thumbnail`}
                            alt="" className="w-full rounded-lg mb-2 cursor-pointer hover:opacity-90"
                            onClick={(e) => { e.stopPropagation(); window.open(`/api/messages/immich-proxy/${msg.image_asset_id}/original`, '_blank'); }} />
                        )}
                        {msg.content && msg.content !== '\u{1F4F8}' && (
                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        )}
                      </>
                    )}

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5">
                      <span className="text-[10px] text-slate-500">{timeAgo(msg.created_at)}</span>
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => toggleComments(msg.id)}
                          className="text-[10px] text-slate-500 hover:text-family-600 flex items-center gap-0.5">
                          <MessageCircle size={10} />{msg.comment_count > 0 && <span> {msg.comment_count}</span>}
                        </button>
                        {isParent && (
                          <>
                            <button onClick={() => startEdit(msg)} className="text-slate-400 hover:text-blue-500"><Edit size={11} /></button>
                            <button onClick={() => togglePin(msg)} className="text-slate-400 hover:text-amber-500"><Pin size={11} /></button>
                            <button onClick={() => deleteMessage(msg.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={11} /></button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded comments */}
                    {expandedMsg === msg.id && (
                      <div className="mt-3 pt-2 border-t border-black/10 space-y-2" onClick={e => e.stopPropagation()}>
                        {(msgComments[msg.id] || []).map(c => (
                          <div key={c.id} className="flex items-start gap-1.5 bg-white/40 rounded-lg p-2">
                            <Avatar url={c.avatar_url} emoji={c.avatar_emoji} size="xs" />
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold">{c.display_name}</span>
                              <p className="text-xs text-slate-600">{c.content}</p>
                            </div>
                            {isParent && (
                              <button onClick={() => deleteComment(msg.id, c.id)} className="text-slate-400 hover:text-red-400 shrink-0"><X size={10} /></button>
                            )}
                          </div>
                        ))}
                        {!isDashboard && (
                          <form onSubmit={(e) => postComment(e, msg.id)} className="flex gap-1">
                            <input value={expandedMsg === msg.id ? newComment : ''} onChange={e => setNewComment(e.target.value)}
                              className="flex-1 bg-white/50 rounded px-2 py-1 text-xs outline-none" placeholder="Reply..." />
                            <button type="submit" className="bg-white/70 rounded px-2 py-1 text-xs font-medium hover:bg-white">Reply</button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {messages.length > 3 && (
                <button onClick={() => setShowAllMessages(!showAllMessages)}
                  className="w-full mt-3 text-sm text-family-500 hover:text-family-600 font-medium py-2 bg-white/50 dark:bg-slate-800/50 rounded-xl hover:bg-white/80 dark:hover:bg-slate-700/80 transition-colors">
                  {showAllMessages ? 'Show less' : `Show all ${messages.length} notes`}
                </button>
              )}
            </>)}
          </div>
        );
      })()}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Today's Meals */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <UtensilsCrossed size={18} className="text-blue-500" /> Today's Menu
            </h2>
            <Link to="/meals" className="text-sm text-family-500 hover:text-family-600 flex items-center gap-1">View all <ChevronRight size={14} /></Link>
          </div>
          {todayMeals.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No meals planned for today</p>
          ) : (
            <div className="space-y-2">
              {todayMeals.map(meal => (
                <div key={meal.id} className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-xl">
                  <span className="text-lg">{meal.meal_type === 'breakfast' ? '\u{1F373}' : meal.meal_type === 'lunch' ? '\u{1F96A}' : meal.meal_type === 'dinner' ? '\u{1F35D}' : '\u{1F34E}'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{meal.title}</p>
                    <p className="text-xs text-slate-400 capitalize">{meal.meal_type}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Calendar Events */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <CalendarDays size={18} className="text-purple-500" /> Today's Events
            </h2>
            <Link to="/calendar" className="text-sm text-family-500 hover:text-family-600 flex items-center gap-1">View all <ChevronRight size={14} /></Link>
          </div>
          {todayEvents.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No events today</p>
          ) : (
            <div className="space-y-2">
              {todayEvents.map(ev => (
                <div key={ev.id} className={`flex items-start gap-3 py-2 px-3 rounded-xl border ${getEventColor(ev.title)}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{ev.title}</p>
                    <p className="text-xs opacity-75">
                      {ev.allDay ? 'All day' : ev.start && new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {ev.location && <> &middot; <MapPin size={10} className="inline" /> {ev.location}</>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Polls / Food Orders */}
        {activePolls.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                <BarChart3 size={18} className="text-orange-500" /> Active Polls
              </h2>
              <Link to="/polls" className="text-sm text-family-500 hover:text-family-600 flex items-center gap-1">View all <ChevronRight size={14} /></Link>
            </div>
            <div className="space-y-2">
              {activePolls.slice(0, 3).map(poll => (
                <Link key={poll.id} to="/polls" className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="text-lg">{poll.type === 'food_order' ? '\u{1F354}' : '\u{1F4CA}'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{poll.type === 'food_order' ? poll.restaurant_name || poll.title : poll.title}</p>
                    <p className="text-xs text-slate-400">
                      {poll.type === 'food_order' ? `${poll.order_count} orders` : `${poll.voter_count} voted`}
                    </p>
                  </div>
                  <span className="badge bg-emerald-100 text-emerald-700">{poll.type === 'food_order' ? 'Order' : 'Vote'}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Pending Requests or Activity */}
        {isParent && pendingRequests.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2"><AlertCircle size={18} className="text-amber-500" /> Pending Requests</h2>
              <Link to="/requests" className="text-sm text-family-500 hover:text-family-600 flex items-center gap-1">View all <ChevronRight size={14} /></Link>
            </div>
            <div className="space-y-2">
              {pendingRequests.map(req => (
                <Link key={req.id} to="/requests" className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                  <span className="text-lg">{CATEGORY_EMOJI[req.category] || '\u{1F4CB}'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{req.title}</p>
                    <p className="text-xs text-slate-400">by {req.submitted_by_name}</p>
                  </div>
                  <span className={`badge ${STATUS_STYLE[req.status]}`}>{req.status.replace('_', ' ')}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
        {isParent && (
          <div className="card">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2 mb-3"><Clock size={18} className="text-slate-400" /> Recent Activity</h2>
            {recentActivity.length === 0 ? (
              <p className="text-slate-400 text-sm py-4 text-center">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.slice(0, 8).map(act => (
                  <div key={act.id} className="flex items-center gap-3 py-1.5">
                    <Avatar url={act.avatar_url} emoji={act.avatar_emoji} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate"><span className="font-medium">{act.display_name}</span>{' '}<span className="text-slate-500">{act.details || act.action}</span></p>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(act.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {!isDashboard && <div className="mt-4 card">
        <h2 className="font-semibold text-slate-700 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Link to="/requests" className="flex flex-col items-center gap-2 p-4 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors">
            <span className="text-2xl">{'\u{1F4DD}'}</span><span className="text-xs font-medium text-amber-700">New Request</span>
          </Link>
          <Link to="/grocery" className="flex flex-col items-center gap-2 p-4 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors">
            <span className="text-2xl">{'\u{1F6D2}'}</span><span className="text-xs font-medium text-emerald-700">Grocery List</span>
          </Link>
          <Link to="/meals" className="flex flex-col items-center gap-2 p-4 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors">
            <span className="text-2xl">{'\u{1F37D}\u{FE0F}'}</span><span className="text-xs font-medium text-blue-700">Meal Plan</span>
          </Link>
          {isParent && (
            <Link to="/admin/users" className="flex flex-col items-center gap-2 p-4 bg-family-50 rounded-xl hover:bg-family-100 transition-colors">
              <span className="text-2xl">{'\u{1F46A}'}</span><span className="text-xs font-medium text-family-700">Add Family</span>
            </Link>
          )}
        </div>
      </div>}
    </div>
  );
}
