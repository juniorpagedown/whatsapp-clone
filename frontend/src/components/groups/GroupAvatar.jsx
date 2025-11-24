import React, { useState } from 'react';

const isValidSource = (value) => typeof value === 'string' && value.trim().length > 0;

const GroupAvatar = ({
  name,
  src,
  className = 'h-12 w-12',
  title
}) => {
  const [hasError, setHasError] = useState(false);
  const showImage = isValidSource(src) && !hasError;
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full bg-wa-bubble-in text-wa-text-primary ${className}`}
      title={title || name}
    >
      {showImage ? (
        <img
          src={src}
          alt={name ? `Foto do grupo ${name}` : 'Foto do grupo'}
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
          loading="lazy"
        />
      ) : (
        <span className="text-lg font-semibold">{initial}</span>
      )}
    </div>
  );
};

export default GroupAvatar;
