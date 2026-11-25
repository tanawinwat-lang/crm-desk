import React, { useState } from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const LOGO_SRC = '/src/assets/images/crm_desk_logo_blue_1795617196635.jpg';

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md' }) => {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'lg'
      ? 'w-10 h-10'
      : size === 'sm'
        ? 'w-7 h-7'
        : 'w-8 h-8';

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className={`${dims} rounded-full bg-blue-700 text-white flex items-center justify-center text-xs font-bold shrink-0`}
      >
        CD
      </div>
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="โลโก้ CRM Desk"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} rounded-full object-cover shrink-0`}
    />
  );
};
