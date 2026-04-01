import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api';
import { MessageSquare, X, Send, Settings, Bot, User, Sparkles, CheckCircle2, Camera, Image } from 'lucide-react';

export default function AiChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({ configured: false });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('claude');
  const [model, setModel] = useState('claude-sonnet-4-20250514');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const photoRef = useRef(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoData, setPhotoData] = useState(null);

  const isParent = user?.role === 'parent';
  const isDashboard = user?.role === 'dashboard';

  useEffect(() => {
    api.get('/ai/status').then(res => setStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const saveConfig = async () => {
    await api.put('/ai/config', { provider, apiKey, model });
    setShowConfig(false);
    setStatus({ configured: true, provider, model });
  };

  const handlePhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Compress and convert to base64
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const max = 1024;
      let w = img.width, h = img.height;
      if (w > max) { h = (h * max) / w; w = max; }
      if (h > max) { w = (w * max) / h; h = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      setPhotoPreview(canvas.toDataURL('image/jpeg', 0.7));
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result.split(',')[1];
          setPhotoData({ base64, mediaType: 'image/jpeg' });
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.7);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  const clearPhoto = () => { setPhotoPreview(null); setPhotoData(null); };

  const sendMessage = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !photoData) || loading) return;

    const userMsg = input.trim();
    const hasPhoto = !!photoData;
    const preview = photoPreview;
    setInput('');
    clearPhoto();
    setMessages(prev => [...prev, { role: 'user', content: userMsg || (hasPhoto ? '📸 [Photo]' : ''), image: preview }]);
    setLoading(true);

    try {
      const history = messages.filter(m => !m.image).map(m => ({ role: m.role, content: m.content }));
      const body = { message: userMsg || 'What items can you see in this photo?', history };
      if (hasPhoto) body.imageData = photoData;
      const res = await api.post('/ai/chat', body);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.reply,
        actions: res.data.actions,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.error || 'Sorry, something went wrong.',
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "What's for dinner today?",
    "What's on the grocery list?",
    "Any open requests?",
    "What's happening this week?",
  ];

  if (isDashboard) return null;

  return (
    <>
      {/* Floating chat button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-24 md:bottom-6 right-4 md:right-6 w-14 h-14 bg-family-500 hover:bg-family-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-30 active:scale-95">
          <Sparkles size={24} />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-20 md:bottom-4 right-2 md:right-4 w-[calc(100vw-1rem)] md:w-96 h-[70vh] md:h-[500px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-family-500 text-white rounded-t-2xl">
            <div className="flex items-center gap-2">
              <Bot size={20} />
              <div>
                <p className="font-semibold text-sm">Family HQ Assistant</p>
                <p className="text-[10px] text-family-200">Ask me anything about your family</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isParent && (
                <button onClick={() => setShowConfig(!showConfig)} className="p-1.5 rounded-lg hover:bg-white/20">
                  <Settings size={16} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Config panel */}
          {showConfig && (
            <div className="p-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 space-y-2">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Provider</label>
                <select value={provider} onChange={e => setProvider(e.target.value)} className="input-field text-xs py-1.5 mt-0.5">
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">API Key</label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password"
                  className="input-field text-xs py-1.5 mt-0.5" placeholder="sk-ant-... or sk-..." />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Model</label>
                <input value={model} onChange={e => setModel(e.target.value)}
                  className="input-field text-xs py-1.5 mt-0.5" placeholder="claude-sonnet-4-20250514" />
              </div>
              <button onClick={saveConfig} className="btn-primary w-full text-xs py-1.5">Save</button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!status.configured && (
              <div className="text-center py-8">
                <Bot size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm text-slate-500">AI Assistant not configured yet</p>
                {isParent ? (
                  <button onClick={() => setShowConfig(true)} className="btn-primary text-xs mt-2">Set up API Key</button>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Ask a parent to configure it</p>
                )}
              </div>
            )}

            {status.configured && messages.length === 0 && (
              <div className="text-center py-4">
                <Sparkles size={32} className="mx-auto mb-2 text-family-400" />
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Hi {user?.displayName}!</p>
                <p className="text-xs text-slate-400 mb-3">Ask me about meals, grocery, requests, or anything family-related.</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickPrompts.map((q, i) => (
                    <button key={i} onClick={() => { setInput(q); }}
                      className="text-[11px] text-left px-2.5 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-family-100 dark:bg-family-900/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={14} className="text-family-600" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-family-500 text-white rounded-br-md'
                    : msg.error
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-bl-md'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-md'
                }`}>
                  {msg.image && <img src={msg.image} alt="" className="rounded-lg mb-1 max-h-32" />}
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.actions?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.actions.map((a, j) => (
                        <div key={j} className="flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={12} /> {a.result}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-family-500 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={14} className="text-white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-family-100 dark:bg-family-900/30 flex items-center justify-center shrink-0">
                  <Bot size={14} className="text-family-600" />
                </div>
                <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {status.configured && (
            <div className="p-3 border-t border-slate-100 dark:border-slate-700">
              {photoPreview && (
                <div className="mb-2 relative inline-block">
                  <img src={photoPreview} alt="Preview" className="h-16 rounded-lg" />
                  <button onClick={clearPhoto} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">
                    <X size={10} />
                  </button>
                </div>
              )}
              <form onSubmit={sendMessage} className="flex gap-2">
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  className="input-field text-sm flex-1 py-2" placeholder={photoData ? "What's in this photo?" : "Ask anything..."}
                  disabled={loading} />
                {isParent && (
                  <>
                    <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
                    <button type="button" onClick={() => photoRef.current?.click()}
                      className={`btn-secondary px-2.5 py-2 ${photoData ? 'ring-2 ring-family-400' : ''}`} disabled={loading}>
                      <Camera size={16} />
                    </button>
                  </>
                )}
                <button type="submit" disabled={loading || (!input.trim() && !photoData)}
                  className="btn-primary px-3 py-2 disabled:opacity-40">
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
