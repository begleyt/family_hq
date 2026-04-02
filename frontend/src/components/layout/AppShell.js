import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../api';
import {
  LayoutDashboard, Ticket, ShoppingCart, UtensilsCrossed, CalendarDays, BarChart3, BookOpen, Package, DollarSign,
  Users, LogOut, Menu, X, Bell, CheckCheck, Moon, Sun, Camera
} from 'lucide-react';
import Avatar from '../common/Avatar';
import ImageCropper from '../common/ImageCropper';
import AiChat from '../common/AiChat';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/requests', icon: Ticket, label: 'Requests' },
  { to: '/grocery', icon: ShoppingCart, label: 'Grocery' },
  { to: '/meals', icon: UtensilsCrossed, label: 'Meals' },
  { to: '/recipes', icon: BookOpen, label: 'Recipes' },
  { to: '/polls', icon: BarChart3, label: 'Polls' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
];

const adminItems = [
  { to: '/pantry', icon: Package, label: 'Pantry' },
  { to: '/spending', icon: DollarSign, label: 'Spending' },
  { to: '/admin/users', icon: Users, label: 'Family Members' },
];

const NOTIF_STYLE = {
  approved: 'bg-emerald-50 border-emerald-200',
  denied: 'bg-red-50 border-red-200',
  comment: 'bg-blue-50 border-blue-200',
  info: 'bg-slate-50 border-slate-200',
};
const NOTIF_ICON = {
  approved: '\u{2705}', denied: '\u{274C}', comment: '\u{1F4AC}', info: '\u{2139}\u{FE0F}'
};

export default function AppShell({ children }) {
  const { user, logout, updateUser } = useAuth();
  const { dark, toggle: toggleDark } = useTheme();
  const avatarInputRef = React.useRef(null);
  const [cropFile, setCropFile] = React.useState(null);

  const handleAvatarSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCropFile(file);
    e.target.value = '';
  };

  const handleCropSave = async (croppedFile) => {
    setCropFile(null);
    const formData = new FormData();
    formData.append('avatar', croppedFile);
    try {
      const res = await api.post('/users/me/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser({ avatarUrl: res.data.avatarUrl });
    } catch (err) { alert('Upload failed'); }
  };
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef(null);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Fetch unread count every 30 seconds
  useEffect(() => {
    const fetchCount = () => {
      api.get('/notifications/unread-count').then(res => setUnreadCount(res.data.count)).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const openNotifications = async () => {
    const res = await api.get('/notifications');
    setNotifications(res.data);
    setNotifOpen(true);
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const markRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setUnreadCount(prev => Math.max(0, prev - 1));
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  };

  // Close notif dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink to={to} onClick={() => setSidebarOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
          isActive ? 'bg-family-500 text-white shadow-md shadow-family-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
        }`
      }>
      <Icon size={20} /><span>{label}</span>
    </NavLink>
  );

  const MobileNavItem = ({ to, icon: Icon, label }) => (
    <NavLink to={to}
      className={({ isActive }) =>
        `flex flex-col items-center gap-0.5 py-1.5 px-2 text-xs font-medium transition-all ${
          isActive ? 'text-family-500' : 'text-slate-400'
        }`
      }>
      <Icon size={22} /><span>{label}</span>
    </NavLink>
  );

  const NotifBell = () => (
    <div className="relative" ref={notifRef}>
      <button onClick={() => notifOpen ? setNotifOpen(false) : openNotifications()}
        className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors">
        <Bell size={20} className="text-slate-500" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {notifOpen && (
        <div className="fixed md:absolute right-4 md:right-auto md:left-0 top-16 md:top-12 w-[calc(100vw-2rem)] md:w-80 max-h-96 overflow-y-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 z-50">
          <div className="sticky top-0 bg-white dark:bg-slate-800 px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between rounded-t-2xl">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-family-500 hover:text-family-600 flex items-center gap-1">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No notifications yet</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {notifications.map(n => (
                <div key={n.id}
                  onClick={() => { if (!n.is_read) markRead(n.id); if (n.request_id) { navigate('/requests'); setNotifOpen(false); } }}
                  className={`px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-family-50/50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{NOTIF_ICON[n.type] || '\u{2139}\u{FE0F}'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? 'font-semibold' : ''}`}>{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at + 'Z').toLocaleString()}</p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-family-500 mt-1.5 shrink-0" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-x-hidden">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-40">
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-xl hover:bg-slate-100">
          <Menu size={22} />
        </button>
        <h1 className="text-lg font-bold text-family-600">Family HQ</h1>
        <div className="flex items-center gap-1">
          <NotifBell />
          <div className="relative" onClick={() => avatarInputRef.current?.click()}>
            <Avatar url={user?.avatarUrl} emoji={user?.avatarEmoji} color={user?.avatarColor} size="sm" />
          </div>
          <input ref={avatarInputRef} type="file" accept="image/*" capture="user" onChange={handleAvatarSelect} className="hidden" />
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 bg-white dark:bg-slate-800 shadow-xl flex flex-col p-4 z-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-family-600">Family HQ</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="flex items-center gap-3 mb-6 p-3 bg-family-50 dark:bg-family-900/30 rounded-xl">
              <Avatar url={user?.avatarUrl} emoji={user?.avatarEmoji} color={user?.avatarColor} size="md" />
              <div>
                <p className="font-semibold text-sm">{user?.displayName}</p>
                <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
              {navItems.map((item) => <NavItem key={item.to} {...item} />)}
              {user?.role === 'parent' && (
                <>
                  <div className="mt-4 mb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent</div>
                  {adminItems.map((item) => <NavItem key={item.to} {...item} />)}
                </>
              )}
            </nav>
            <button onClick={toggleDark} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 mt-2">
              {dark ? <Sun size={20} /> : <Moon size={20} />} {dark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <LogOut size={20} /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-slate-800 border-r border-slate-100 dark:border-slate-700 p-4 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center justify-between px-4 mb-6 mt-2">
          <h1 className="text-xl font-bold text-family-600">Family HQ</h1>
          <NotifBell />
        </div>
        <div className="flex items-center gap-3 mb-6 p-3 bg-family-50 dark:bg-family-900/30 rounded-xl">
          <div className="relative group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
            <Avatar url={user?.avatarUrl} emoji={user?.avatarEmoji} color={user?.avatarColor} size="md" />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={14} className="text-white" />
            </div>
          </div>
          <div>
            <p className="font-semibold text-sm">{user?.displayName}</p>
            <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => <NavItem key={item.to} {...item} />)}
          {user?.role === 'parent' && (
            <>
              <div className="mt-6 mb-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Parent</div>
              {adminItems.map((item) => <NavItem key={item.to} {...item} />)}
            </>
          )}
        </nav>
        <button onClick={toggleDark} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 mt-2">
          {dark ? <Sun size={20} /> : <Moon size={20} />} {dark ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
          <LogOut size={20} /> Sign Out
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-4 overflow-x-hidden overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 md:p-6 overflow-hidden">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar — only 5 core pages */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex justify-around items-center px-2 pt-1 pb-safe z-40">
        <MobileNavItem to="/" icon={LayoutDashboard} label="Home" />
        <MobileNavItem to="/requests" icon={Ticket} label="Requests" />
        <MobileNavItem to="/grocery" icon={ShoppingCart} label="Grocery" />
        <MobileNavItem to="/meals" icon={UtensilsCrossed} label="Meals" />
        <MobileNavItem to="/calendar" icon={CalendarDays} label="Calendar" />
      </nav>

      {/* AI Chat */}
      <AiChat />

      {/* Image Cropper Modal */}
      {cropFile && (
        <ImageCropper
          imageFile={cropFile}
          onSave={handleCropSave}
          onCancel={() => setCropFile(null)}
          size={300}
        />
      )}
    </div>
  );
}
