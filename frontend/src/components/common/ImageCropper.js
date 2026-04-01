import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Check, X } from 'lucide-react';

export default function ImageCropper({ imageFile, onSave, onCancel, size = 300 }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const previewSize = Math.min(280, window.innerWidth - 80);

  useEffect(() => {
    if (!imageFile) return;
    const image = new window.Image();
    image.onload = () => {
      setImg(image);
      // Auto-fit: zoom so shortest side fills the circle
      const minDim = Math.min(image.width, image.height);
      setZoom(previewSize / minDim);
      setOffset({ x: 0, y: 0 });
      setRotation(0);
    };
    image.src = URL.createObjectURL(imageFile);
    return () => URL.revokeObjectURL(image.src);
  }, [imageFile, previewSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    canvas.width = previewSize;
    canvas.height = previewSize;

    ctx.clearRect(0, 0, previewSize, previewSize);

    // Draw image centered with zoom, offset, rotation
    ctx.save();
    ctx.translate(previewSize / 2 + offset.x, previewSize / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Draw circular mask overlay
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(previewSize / 2, previewSize / 2, previewSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [img, zoom, offset, rotation, previewSize]);

  useEffect(() => { draw(); }, [draw]);

  const handlePointerDown = (e) => {
    setDragging(true);
    const rect = canvasRef.current.getBoundingClientRect();
    setDragStart({ x: e.clientX - rect.left - offset.x, y: e.clientY - rect.top - offset.y });
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setOffset({
      x: e.clientX - rect.left - dragStart.x,
      y: e.clientY - rect.top - dragStart.y,
    });
  };

  const handlePointerUp = () => setDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom(z => Math.max(0.1, Math.min(5, z + delta)));
  };

  const handleSave = () => {
    // Render final image at target size
    const outCanvas = document.createElement('canvas');
    outCanvas.width = size;
    outCanvas.height = size;
    const ctx = outCanvas.getContext('2d');

    const scale = size / previewSize;
    ctx.translate(size / 2 + offset.x * scale, size / 2 + offset.y * scale);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom * scale, zoom * scale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    // Clip to circle
    const clipCanvas = document.createElement('canvas');
    clipCanvas.width = size;
    clipCanvas.height = size;
    const clipCtx = clipCanvas.getContext('2d');
    clipCtx.beginPath();
    clipCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    clipCtx.clip();
    clipCtx.drawImage(outCanvas, 0, 0);

    clipCanvas.toBlob((blob) => {
      onSave(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  if (!img) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl p-5 z-50 w-full max-w-sm">
        <h3 className="text-lg font-bold mb-3 text-center">Adjust Profile Photo</h3>

        {/* Preview area */}
        <div className="flex justify-center mb-4">
          <div className="relative" style={{ width: previewSize, height: previewSize }}>
            {/* Background ring */}
            <div className="absolute inset-0 rounded-full border-4 border-dashed border-slate-200 dark:border-slate-600" />
            <canvas
              ref={canvasRef}
              width={previewSize}
              height={previewSize}
              className="rounded-full cursor-grab active:cursor-grabbing touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onWheel={handleWheel}
              style={{ touchAction: 'none' }}
            />
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center mb-3">Drag to reposition. Pinch or use buttons to zoom.</p>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">
            <ZoomOut size={18} />
          </button>
          <input type="range" min="0.1" max="4" step="0.05" value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer" />
          <button onClick={() => setZoom(z => Math.min(5, z + 0.1))}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">
            <ZoomIn size={18} />
          </button>
          <button onClick={() => setRotation(r => (r + 90) % 360)}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600">
            <RotateCw size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1 flex items-center justify-center gap-2">
            <X size={16} /> Cancel
          </button>
          <button onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
