import React, { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react';

interface NewsImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const NewsImage: React.FC<NewsImageProps> = ({ src, alt, className = '' }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center gap-2 p-4 text-center ${className}`}
        style={{
          background:
            'linear-gradient(135deg, var(--vp-elevated) 0%, var(--vp-secondary) 100%)',
          color: 'var(--vp-muted)',
        }}
      >
        <Newspaper className="h-7 w-7 opacity-60" />
        <span className="text-xs font-medium line-clamp-2 max-w-[220px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
