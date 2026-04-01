import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import Avatar from '../components/common/Avatar';
import {
  Plus, X, BarChart3, UtensilsCrossed, Check, Lock,
  Unlock, Trash2, Users, ChevronRight, Send, User, ChevronDown
} from 'lucide-react';

export default function PollsPage() {
  const { user } = useAuth();
  const isParent = user.role === 'parent';
  const isDashboard = user.role === 'dashboard';
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState('open');

  // Create form
  const [createType, setCreateType] = useState('poll');
  const [title, setTitle] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);

  // Food order form
  const [orderItems, setOrderItems] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderForUser, setOrderForUser] = useState('');
  const [guestName, setGuestName] = useState('');
  const [showAddFor, setShowAddFor] = useState(false);

  const fetchPolls = useCallback(() => {
    api.get(`/polls?status=${tab}`).then(res => { setPolls(res.data); setLoading(false); });
  }, [tab]);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  const loadDetail = async (id) => {
    const res = await api.get(`/polls/${id}`);
    setDetail(res.data);
    setOrderItems(''); setOrderNotes(''); setOrderForUser('');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const body = { type: createType, allowMultiple };
    if (createType === 'food_order') {
      if (!restaurantName.trim()) return alert('Enter a restaurant name');
      body.title = title.trim() || `What does everyone want from ${restaurantName}?`;
      body.restaurantName = restaurantName;
    } else {
      if (!title.trim()) return alert('Enter a question');
      body.title = title;
      body.options = options.filter(o => o.trim());
      if (body.options.length < 2) return alert('Add at least 2 options');
    }
    await api.post('/polls', body);
    setShowCreate(false);
    setTitle(''); setRestaurantName(''); setOptions(['', '']); setCreateType('poll');
    fetchPolls();
  };

  const handleVote = async (optionId) => {
    if (!detail || detail.status !== 'open' || isDashboard) return;
    await api.post(`/polls/${detail.id}/vote`, { optionId });
    loadDetail(detail.id);
  };

  const handleOrder = async (e, userId, isGuest) => {
    e.preventDefault();
    if (!orderItems.trim()) return;
    const body = { items: orderItems, notes: orderNotes };
    if (isGuest && guestName.trim()) {
      body.guestName = guestName.trim();
    } else if (userId) {
      body.userId = userId;
    }
    await api.post(`/polls/${detail.id}/order`, body);
    setOrderItems(''); setOrderNotes(''); setOrderForUser(''); setGuestName(''); setShowAddFor(false);
    loadDetail(detail.id);
  };

  const deleteOrder = async (orderId) => {
    await api.delete(`/polls/${detail.id}/order/${orderId}`);
    loadDetail(detail.id);
  };

  const toggleStatus = async (poll) => {
    await api.put(`/polls/${poll.id}`, { status: poll.status === 'open' ? 'closed' : 'open' });
    fetchPolls();
    if (detail?.id === poll.id) loadDetail(poll.id);
  };

  const deletePoll = async (id) => {
    if (!window.confirm('Delete this poll?')) return;
    await api.delete(`/polls/${id}`);
    setDetail(null);
    fetchPolls();
  };

  const addOption = () => setOptions([...options, '']);
  const updateOption = (i, val) => { const o = [...options]; o[i] = val; setOptions(o); };
  const removeOption = (i) => { if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i)); };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Polls & Orders</h1>
        {isParent && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={18} /> New Poll
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button onClick={() => setTab('open')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'open' ? 'bg-family-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
          Active
        </button>
        <button onClick={() => setTab('closed')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === 'closed' ? 'bg-family-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
          Past
        </button>
      </div>

      {/* Poll List */}
      {polls.length === 0 ? (
        <div className="card text-center py-12">
          <span className="text-4xl mb-3 block">{tab === 'open' ? '\u{1F4CA}' : '\u{1F4C1}'}</span>
          <p className="text-slate-500">{tab === 'open' ? 'No active polls' : 'No past polls'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {polls.map(poll => (
            <div key={poll.id} onClick={() => loadDetail(poll.id)} className="card cursor-pointer hover:shadow-md transition-shadow flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg ${poll.type === 'food_order' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-family-100 dark:bg-family-900/30'}`}>
                {poll.type === 'food_order' ? '\u{1F354}' : '\u{1F4CA}'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{poll.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {poll.created_by_emoji} {poll.created_by_name}
                  {poll.type === 'food_order' && poll.restaurant_name && <> &middot; {poll.restaurant_name}</>}
                  {poll.type === 'poll' && <> &middot; {poll.voter_count} voted</>}
                  {poll.type === 'food_order' && <> &middot; {poll.order_count} orders</>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge ${poll.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {poll.status === 'open' ? 'Active' : 'Closed'}
                </span>
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[85vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Create Poll</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
            </div>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setCreateType('poll')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                  createType === 'poll' ? 'bg-family-100 dark:bg-family-900/30 ring-2 ring-family-400 text-family-700 dark:text-family-300' : 'bg-slate-50 dark:bg-slate-700 text-slate-500'
                }`}>
                <BarChart3 size={18} /> Vote Poll
              </button>
              <button onClick={() => setCreateType('food_order')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all ${
                  createType === 'food_order' ? 'bg-orange-100 dark:bg-orange-900/30 ring-2 ring-orange-400 text-orange-700 dark:text-orange-300' : 'bg-slate-50 dark:bg-slate-700 text-slate-500'
                }`}>
                <UtensilsCrossed size={18} /> Food Order
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              {createType === 'food_order' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Restaurant</label>
                    <input value={restaurantName} onChange={e => setRestaurantName(e.target.value)} className="input-field"
                      placeholder="e.g., McDonald's, Chick-fil-A" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Message (optional)</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} className="input-field"
                      placeholder={`e.g., What does everyone want from ${restaurantName || 'the restaurant'}?`} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Question</label>
                    <input value={title} onChange={e => setTitle(e.target.value)} className="input-field"
                      placeholder="e.g., Where should we eat Friday?" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Options</label>
                    <div className="space-y-2">
                      {options.map((opt, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={opt} onChange={e => updateOption(i, e.target.value)} className="input-field text-sm"
                            placeholder={`Option ${i + 1}`} />
                          {options.length > 2 && (
                            <button type="button" onClick={() => removeOption(i)} className="p-2 text-slate-400 hover:text-red-500"><X size={16} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addOption} className="text-sm text-family-500 hover:text-family-600 mt-2">+ Add option</button>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={allowMultiple} onChange={e => setAllowMultiple(e.target.checked)} className="rounded" />
                    Allow multiple votes
                  </label>
                </>
              )}
              <button type="submit" className="btn-primary w-full">
                {createType === 'food_order' ? `Send Food Order Request` : 'Create Poll'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setDetail(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto z-50">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-800 p-5 pb-3 border-b border-slate-100 dark:border-slate-700 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{detail.type === 'food_order' ? '\u{1F354}' : '\u{1F4CA}'}</span>
                  <div>
                    <h2 className="text-lg font-bold">
                      {detail.type === 'food_order' ? (detail.restaurant_name || detail.title) : detail.title}
                    </h2>
                    {detail.type === 'food_order' && detail.title && detail.title !== detail.restaurant_name && (
                      <p className="text-sm text-slate-500">{detail.title}</p>
                    )}
                  </div>
                </div>
                <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"><X size={20} /></button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`badge ${detail.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {detail.status === 'open' ? 'Active' : 'Closed'}
                </span>
                <span className="text-xs text-slate-400">by {detail.created_by_name}</span>
                {isParent && (
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => toggleStatus(detail)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                      {detail.status === 'open' ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <button onClick={() => deletePoll(detail.id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5">
              {/* Regular Poll */}
              {detail.type === 'poll' && (
                <div className="space-y-2">
                  {detail.options?.map(opt => {
                    const pct = detail.totalVotes > 0 ? Math.round((opt.vote_count / Math.max(1, detail.totalVotes)) * 100) : 0;
                    const hasVoted = detail.myVotes?.includes(opt.id);
                    return (
                      <button key={opt.id}
                        onClick={() => handleVote(opt.id)}
                        disabled={detail.status !== 'open' || isDashboard}
                        className={`w-full text-left rounded-xl p-3 border-2 transition-all relative overflow-hidden ${
                          hasVoted ? 'border-family-400 bg-family-50 dark:bg-family-900/20' : 'border-slate-100 dark:border-slate-600 hover:border-slate-200'
                        } ${detail.status !== 'open' || isDashboard ? '' : 'cursor-pointer'}`}>
                        {/* Background bar */}
                        <div className="absolute inset-0 bg-family-100 dark:bg-family-900/30 transition-all" style={{ width: `${pct}%` }} />
                        <div className="relative flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {hasVoted && <Check size={16} className="text-family-500" />}
                            <span className="text-sm font-medium">{opt.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{pct}%</span>
                            <span className="text-xs text-slate-400">({opt.vote_count})</span>
                          </div>
                        </div>
                        {/* Show who voted */}
                        {detail.voters?.filter(v => v.option_id === opt.id).length > 0 && (
                          <div className="relative flex gap-1 mt-1.5 flex-wrap">
                            {detail.voters.filter(v => v.option_id === opt.id).map((v, i) => (
                              <span key={i} className="text-xs bg-white/60 dark:bg-slate-700/60 rounded-full px-2 py-0.5">
                                <Avatar url={v.avatar_url} emoji={v.avatar_emoji} size="xs" className="inline-block" /> {v.display_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                  <p className="text-xs text-slate-400 text-center mt-2">
                    {detail.totalVotes} {detail.totalVotes === 1 ? 'person' : 'people'} voted
                    {detail.allow_multiple ? ' (multiple votes allowed)' : ''}
                  </p>
                </div>
              )}

              {/* Food Order */}
              {detail.type === 'food_order' && (
                <div>
                  {/* Submit order form */}
                  {detail.status === 'open' && !isDashboard && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                        <UtensilsCrossed size={16} /> Your Order
                      </h3>
                      <form onSubmit={(e) => handleOrder(e)} className="space-y-2">
                        <textarea value={orderItems} onChange={e => setOrderItems(e.target.value)}
                          className="input-field text-sm min-h-[60px] resize-none"
                          placeholder={`What do you want from ${detail.restaurant_name || 'the restaurant'}?\ne.g., Big Mac, medium fries, Sprite`} />
                        <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                          className="input-field text-sm" placeholder="Special requests (no pickles, extra sauce, etc.)" />
                        <button type="submit" className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                          <Send size={14} /> Submit My Order
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Parent: add order for someone else */}
                  {isParent && detail.status === 'open' && (
                    <div className="mb-4">
                      <button onClick={() => setShowAddFor(!showAddFor)}
                        className="text-sm text-family-500 hover:text-family-600 flex items-center gap-1 mb-2">
                        <User size={14} /> Add order for someone else <ChevronDown size={14} className={`transition-transform ${showAddFor ? 'rotate-180' : ''}`} />
                      </button>
                      {showAddFor && (
                        <div className="space-y-3 bg-slate-50 dark:bg-slate-700 rounded-xl p-3">
                          {/* For existing user */}
                          <form onSubmit={(e) => handleOrder(e, orderForUser, false)} className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500">Family member with account:</p>
                            <select value={orderForUser} onChange={e => setOrderForUser(e.target.value)} className="input-field text-sm">
                              <option value="">Select person...</option>
                              {detail.allUsers?.map(u => (
                                <option key={u.id} value={u.id}>{u.avatar_emoji} {u.display_name}</option>
                              ))}
                            </select>
                            {orderForUser && (
                              <>
                                <textarea value={orderItems} onChange={e => setOrderItems(e.target.value)}
                                  className="input-field text-sm min-h-[50px] resize-none" placeholder="Their order..." required />
                                <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                                  className="input-field text-sm" placeholder="Special requests..." />
                                <button type="submit" className="btn-secondary w-full text-sm">Add Order</button>
                              </>
                            )}
                          </form>
                          {/* For guest (no account) */}
                          <div className="border-t border-slate-200 dark:border-slate-600 pt-3">
                            <form onSubmit={(e) => handleOrder(e, null, true)} className="space-y-2">
                              <p className="text-xs font-semibold text-slate-500">Or add for someone without an account:</p>
                              <input value={guestName} onChange={e => setGuestName(e.target.value)}
                                className="input-field text-sm" placeholder="Name (e.g., Grandma, Baby Jake)" required />
                              {guestName.trim() && (
                                <>
                                  <textarea value={orderItems} onChange={e => setOrderItems(e.target.value)}
                                    className="input-field text-sm min-h-[50px] resize-none" placeholder="Their order..." required />
                                  <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
                                    className="input-field text-sm" placeholder="Special requests..." />
                                  <button type="submit" className="btn-secondary w-full text-sm">Add Guest Order</button>
                                </>
                              )}
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Orders list */}
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
                    <Users size={16} /> Orders ({detail.orders?.length || 0})
                  </h3>
                  {(!detail.orders || detail.orders.length === 0) ? (
                    <p className="text-slate-400 text-sm text-center py-4">No orders yet</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.orders.map(order => (
                        <div key={order.id} className="bg-slate-50 dark:bg-slate-700 rounded-xl p-3 relative group">
                          <div className="flex items-center gap-2 mb-1">
                            <Avatar url={order.avatar_url} emoji={order.avatar_emoji || '\u{1F464}'} size="sm" />
                            <span className="text-sm font-semibold">{order.display_name || order.guest_name || 'Guest'}</span>
                            {order.guest_name && <span className="badge bg-slate-200 text-slate-600 text-[10px]">Guest</span>}
                            {order.entered_by_name && (
                              <span className="text-[10px] text-slate-400">(entered by {order.entered_by_name})</span>
                            )}
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{order.items}</p>
                          {order.notes && <p className="text-xs text-slate-400 mt-1 italic">{order.notes}</p>}
                          {isParent && (
                            <button onClick={() => deleteOrder(order.id)}
                              className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Order summary for parent */}
                  {isParent && detail.orders?.length > 0 && (
                    <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        {'\u{1F4CB}'} Order Summary
                      </h4>
                      <div className="space-y-1">
                        {detail.orders.map(o => (
                          <p key={o.id} className="text-sm text-amber-900 dark:text-amber-100">
                            <span className="font-medium">{o.display_name || o.guest_name || 'Guest'}:</span> {o.items}
                            {o.notes && <span className="text-xs text-amber-600"> ({o.notes})</span>}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
