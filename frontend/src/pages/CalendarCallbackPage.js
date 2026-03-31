import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../api';

export default function CalendarCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Connecting to Google Calendar...');

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('Authorization denied: ' + error);
      setTimeout(() => navigate('/calendar'), 3000);
      return;
    }

    if (code) {
      api.post('/calendar/callback', { code })
        .then(() => {
          setStatus('Connected! Redirecting...');
          setTimeout(() => navigate('/calendar'), 1500);
        })
        .catch(err => {
          setStatus('Failed: ' + (err.response?.data?.error || err.message));
          setTimeout(() => navigate('/calendar'), 4000);
        });
    } else {
      setStatus('No authorization code received');
      setTimeout(() => navigate('/calendar'), 3000);
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
      <div className="card max-w-sm text-center">
        <div className="text-4xl mb-3">{status.includes('Connected') ? '\u{2705}' : status.includes('Failed') || status.includes('denied') ? '\u{274C}' : '\u{23F3}'}</div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p>
      </div>
    </div>
  );
}
