import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { Plus, X, RotateCcw, UserX, UserCheck, Edit } from 'lucide-react';

const ROLES = [
  { value: 'parent', label: 'Parent', emoji: '\u{1F9D1}' },
  { value: 'teen', label: 'Teen', emoji: '\u{1F9D2}' },
  { value: 'child', label: 'Child', emoji: '\u{1F476}' },
  { value: 'dashboard', label: 'Dashboard', emoji: '\u{1F4FA}' },
];

const AVATARS = [
  '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}', '\u{1F60A}', '\u{1F60E}', '\u{1F913}', '\u{1F47B}',
  '\u{1F680}', '\u{1F31F}', '\u{1F984}', '\u{1F981}', '\u{1F436}',
  '\u{1F431}', '\u{1F43C}', '\u{1F985}', '\u{1F996}', '\u{1F47E}',
  '\u{1F478}', '\u{1F934}', '\u{1F9B8}', '\u{1F9D9}', '\u{1F3AE}'
];

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#6d28d9'
];

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetId, setResetId] = useState(null);
  const [resetPw, setResetPw] = useState('');

  // Form state
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('child');
  const [avatarEmoji, setAvatarEmoji] = useState('\u{1F60A}');
  const [avatarColor, setAvatarColor] = useState('#6366f1');

  const fetchUsers = () => {
    api.get('/users').then(res => { setUsers(res.data); setLoading(false); });
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', { username, displayName, password, role, avatarEmoji, avatarColor });
      clearForm();
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/users/${editUser.id}`, { displayName, role, avatarEmoji, avatarColor });
      clearForm();
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleToggleActive = async (u) => {
    await api.put(`/users/${u.id}`, { isActive: u.is_active ? 0 : 1 });
    fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!resetPw) return;
    await api.post(`/users/${resetId}/reset-password`, { newPassword: resetPw });
    setResetId(null);
    setResetPw('');
    alert('Password reset! They will need to change it on next login.');
  };

  const clearForm = () => {
    setUsername(''); setDisplayName(''); setPassword('');
    setRole('child'); setAvatarEmoji('\u{1F60A}'); setAvatarColor('#6366f1');
  };

  const startEdit = (u) => {
    setDisplayName(u.display_name);
    setRole(u.role);
    setAvatarEmoji(u.avatar_emoji);
    setAvatarColor(u.avatar_color);
    setEditUser(u);
  };

  if (currentUser.role !== 'parent') return <div className="text-center text-red-500 mt-12">Access denied</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-family-300 border-t-family-600 rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Family Members</h1>
        <button onClick={() => { clearForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={18} /> Add Member
        </button>
      </div>

      {/* User Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {users.map(u => (
          <div key={u.id} className={`card flex items-center gap-4 ${!u.is_active ? 'opacity-50' : ''}`}>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ backgroundColor: u.avatar_color + '20' }}
            >
              {u.avatar_emoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{u.display_name}</p>
              <p className="text-sm text-slate-500">@{u.username} &middot; <span className="capitalize">{u.role}</span></p>
              {u.must_change_password ? (
                <span className="badge bg-amber-100 text-amber-600 mt-1">Needs password change</span>
              ) : null}
              {!u.is_active && <span className="badge bg-red-100 text-red-600 mt-1">Inactive</span>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button onClick={() => startEdit(u)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <Edit size={16} />
              </button>
              <button onClick={() => setResetId(u.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600">
                <RotateCcw size={16} />
              </button>
              {u.id !== currentUser.id && (
                <button onClick={() => handleToggleActive(u)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-600">
                  {u.is_active ? <UserX size={16} /> : <UserCheck size={16} />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {(showForm || editUser) && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowForm(false); setEditUser(null); }} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md max-h-[90vh] overflow-y-auto p-5 z-50">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{editUser ? 'Edit Member' : 'Add Family Member'}</h2>
              <button onClick={() => { setShowForm(false); setEditUser(null); }} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <form onSubmit={editUser ? handleUpdate : handleCreate} className="space-y-3">
              {!editUser && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Username</label>
                    <input value={username} onChange={e => setUsername(e.target.value)} className="input-field" placeholder="e.g., kiddo123" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Temporary Password</label>
                    <input value={password} onChange={e => setPassword(e.target.value)} className="input-field" placeholder="They'll change this on first login" required />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Display Name</label>
                <input value={displayName} onChange={e => setDisplayName(e.target.value)} className="input-field" placeholder="e.g., Emma" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Role</label>
                <div className="flex gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        role === r.value ? 'bg-family-100 text-family-700 ring-2 ring-family-400' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <span>{r.emoji}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {AVATARS.map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAvatarEmoji(a)}
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                        avatarEmoji === a ? 'ring-2 ring-family-400 bg-family-50 scale-110' : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Color</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAvatarColor(c)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        avatarColor === c ? 'ring-2 ring-offset-2 ring-family-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn-primary w-full">
                {editUser ? 'Save Changes' : 'Add Member'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/30" onClick={() => setResetId(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 z-50">
            <h2 className="text-lg font-bold mb-3">Reset Password</h2>
            <p className="text-sm text-slate-500 mb-3">Set a new temporary password. They'll need to change it on next login.</p>
            <input
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              className="input-field mb-3"
              placeholder="New temporary password"
            />
            <div className="flex gap-2">
              <button onClick={() => setResetId(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleResetPassword} className="btn-primary flex-1">Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
