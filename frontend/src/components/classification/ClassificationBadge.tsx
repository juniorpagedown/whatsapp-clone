import React from 'react';

type ClassificationBadgeProps = {
  onClick: () => void;
  title?: string;
  anchor?: 'left' | 'right';
  status?: string;
};

const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({
  onClick,
  title,
  anchor = 'right',
  status = 'unclassified'
}) => {
  const anchorClass = anchor === 'left' ? 'classification-badge--left' : 'classification-badge--right';

  return (
    <button
      type="button"
      className={`classification-badge ${anchorClass}`}
      aria-label="Classificar mensagem"
      title={title ?? 'Classificar mensagem'}
      onClick={onClick}
      data-status={status}
    />
  );
};

export default ClassificationBadge;
