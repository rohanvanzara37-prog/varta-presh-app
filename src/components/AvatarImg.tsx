import React, { useEffect, useState } from 'react';

interface AvatarImgProps {
  src?: string;
  name: string;
  sizeClass?: string;
  className?: string;
}

export const AvatarImg: React.FC<AvatarImgProps> = ({
  src,
  name,
  sizeClass = 'w-10 h-10',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initial = (name || 'M').trim().charAt(0).toUpperCase();

  if (!src || failed) {
    return (
      <div
        aria-label={name}
        className={`${sizeClass} rounded-full bg-[#1877F2] text-white font-display font-bold flex items-center justify-center shrink-0 select-none ${className}`}
      >
        <span className="text-sm">{initial}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} rounded-full object-cover shrink-0 bg-[#E4E6EB] dark:bg-[#3A3B3C] ${className}`}
    />
  );
};
