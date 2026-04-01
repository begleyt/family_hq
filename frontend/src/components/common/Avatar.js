import React from 'react';

export default function Avatar({ url, emoji, color, size = 'md', className = '' }) {
  const sizes = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-xl',
    lg: 'w-14 h-14 text-2xl',
    xl: 'w-20 h-20 text-4xl',
  };

  if (url) {
    return (
      <img src={url} alt=""
        className={`${sizes[size]} rounded-full object-cover shrink-0 ${className}`} />
    );
  }

  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: (color || '#6366f1') + '20' }}>
      {emoji || '\u{1F60A}'}
    </div>
  );
}
