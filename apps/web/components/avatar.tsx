'use client';

import { useState } from 'react';
import { avatarStyle, initials } from '@/lib/forum-ui';

export default function Avatar({
  name,
  src = null,
  size = 'md',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== null && src !== '' && !failed;

  return (
    <span
      className={`avatar avatar-${size}${className === '' ? '' : ` ${className}`}`}
      style={avatarStyle(name)}
      title={name}
    >
      <span className="avatar-fallback" aria-hidden="true">
        {initials(name)}
      </span>
      {showImage ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : null}
    </span>
  );
}
