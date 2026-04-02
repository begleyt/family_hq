import React, { useState, useRef } from 'react';
import api from '../../api';
import { Camera, X, Loader2 } from 'lucide-react';

export default function AiScanButton({ target, onComplete }) {
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    // Compress
    const img = new window.Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const max = 1024;
      let w = img.width, h = img.height;
      if (w > max) { h = (h * max) / w; w = max; }
      if (h > max) { w = (w * max) / h; h = max; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      setPreview(canvas.toDataURL('image/jpeg', 0.7));
      setScanning(true);

      canvas.toBlob(async (blob) => {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          try {
            const prompt = target === 'pantry'
              ? 'Identify all food items in this photo. Add them to the pantry inventory with estimated quantities and the correct storage location (fridge, freezer, pantry, cabinet, or counter). Categorize each item.'
              : 'Identify all food items in this photo. Add them to the grocery/shopping list with estimated quantities. Categorize each item into the correct grocery aisle.';

            const res = await api.post('/ai/chat', {
              message: prompt,
              imageData: { base64, mediaType: 'image/jpeg' },
            });

            if (onComplete) onComplete(res.data);
            alert(res.data.reply || 'Items added!');
          } catch (err) {
            alert(err.response?.data?.error || 'Scan failed');
          } finally {
            setScanning(false);
            setPreview(null);
          }
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', 0.7);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
      <button onClick={() => inputRef.current?.click()} disabled={scanning}
        className="btn-secondary text-sm flex items-center gap-1">
        {scanning ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        <span className="hidden sm:inline">{scanning ? 'Scanning...' : 'Scan'}</span>
      </button>

      {preview && scanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-5 z-50 text-center max-w-sm">
            <img src={preview} alt="Scanning" className="rounded-xl mb-3 max-h-48 mx-auto" />
            <div className="flex items-center justify-center gap-2 text-family-600">
              <Loader2 size={18} className="animate-spin" />
              <p className="text-sm font-medium">AI is identifying items...</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
