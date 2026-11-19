import React from 'react';

interface BrandLogoProps {
  size?: 'sm' | 'md';
  showSubtitle?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showSubtitle = false,
}) => {
  const iconDim = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';

  return (
    <div className="inline-flex items-center gap-2.5 select-none whitespace-nowrap shrink-0">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDim} shrink-0`}
        aria-hidden="true"
      >
        <rect width="36" height="36" rx="9" fill="#0F172A" />
        <rect
          x="0.75"
          y="0.75"
          width="34.5"
          height="34.5"
          rx="8.25"
          stroke="#1E293B"
          strokeWidth="1.5"
        />
        {/* Precision Candlestick + Breakout Delta Geometry */}
        <line
          x1="11"
          y1="9"
          x2="11"
          y2="27"
          stroke="#475569"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <rect x="8.75" y="15" width="4.5" height="8" rx="1.25" fill="#64748B" />

        <line
          x1="18"
          y1="8"
          x2="18"
          y2="25"
          stroke="#3B82F6"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <rect x="15.75" y="12" width="4.5" height="9.5" rx="1.25" fill="#2563EB" />

        <line
          x1="25"
          y1="7"
          x2="25"
          y2="22"
          stroke="#10B981"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <rect x="22.75" y="9.5" width="4.5" height="9" rx="1.25" fill="#10B981" />

        {/* Subtle ascending vector signal line */}
        <path
          d="M9.5 25.5L18 19.5L26.5 11.5"
          stroke="#F8FAFC"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.9"
        />
      </svg>

      <div className="leading-none">
        <span
          className={`font-display font-bold tracking-tight text-slate-900 dark:text-slate-100 ${
            size === 'sm' ? 'text-base' : 'text-[17px]'
          }`}
        >
          Neo<span className="text-blue-600 dark:text-blue-400">Algo</span>
        </span>
        {showSubtitle && (
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
            Quantitative Desk
          </div>
        )}
      </div>
    </div>
  );
};
