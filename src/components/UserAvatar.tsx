import React from 'react';

interface UserAvatarProps {
  name: string;
  avatarDataUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-9 h-9 text-xs',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarDataUrl,
  size = 'sm',
  className = '',
}) => {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'TR';

  const dim = SIZE_CLASSES[size];

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${dim} rounded-full object-cover ring-1 ring-slate-200 shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${dim} rounded-full bg-slate-900 text-white font-display font-semibold flex items-center justify-center ring-1 ring-slate-900/10 shrink-0 select-none ${className}`}
    >
      {initials}
    </div>
  );
};
