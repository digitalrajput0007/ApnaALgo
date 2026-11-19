import React from 'react';

export type BrokerLogoId =
  | 'fyers'
  | 'zerodha'
  | 'dhan'
  | 'upstox'
  | 'angelone';

interface BrokerLogoProps {
  brokerId: BrokerLogoId;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: 'w-9 h-9 rounded-lg',
  md: 'w-11 h-11 rounded-xl',
  lg: 'w-12 h-12 rounded-xl',
};

const ICON_SIZE_MAP = {
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
};

export const BrokerLogo: React.FC<BrokerLogoProps> = ({
  brokerId,
  size = 'md',
}) => {
  const box = SIZE_MAP[size];
  const icon = ICON_SIZE_MAP[size];

  switch (brokerId) {
    case 'fyers':
      return (
        <div
          className={`${box} bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center shadow-xs shrink-0`}
          aria-hidden="true"
        >
          {/* Fyers geometric angled F / ascending precision bars */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className={icon}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 7.5H24.5L22 12H13.5V15H21L18.8 19.2H13.5V25.5L9 23.2V7.5Z"
              fill="#FFFFFF"
            />
            <path
              d="M21.5 20.5L25 18.2V25.5H21.5V20.5Z"
              fill="#93C5FD"
            />
          </svg>
        </div>
      );

    case 'zerodha':
      return (
        <div
          className={`${box} bg-[#FFF3EE] border border-[#FFD6C6] flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          {/* Zerodha Kite origami chevron diamond */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className={icon}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M14.2 6L26 16L14.2 26L8.2 20.6L14.8 16L8.2 11.4L14.2 6Z"
              fill="#FF5722"
            />
            <path
              d="M14.2 6L19.6 16L14.2 26L14.8 16L14.2 6Z"
              fill="#D84315"
              fillOpacity="0.45"
            />
          </svg>
        </div>
      );

    case 'dhan':
      return (
        <div
          className={`${box} bg-[#ECFDF5] border border-[#A7F3D0] flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          {/* Dhan lightning emerald geometric D */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className={icon}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.5 7H16.2C21.6 7 25 10.6 25 16C25 21.4 21.6 25 16.2 25H8.5V7Z"
              fill="#00B386"
            />
            <path
              d="M13 11.2H16C18.8 11.2 20.5 13 20.5 16C20.5 19 18.8 20.8 16 20.8H13V11.2Z"
              fill="#ECFDF5"
            />
            <path
              d="M15.8 13.3L19.2 16L15.8 18.7V13.3Z"
              fill="#059669"
            />
          </svg>
        </div>
      );

    case 'upstox':
      return (
        <div
          className={`${box} bg-[#F5F0FF] border border-[#DDD6FE] flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          {/* Upstox royal violet U with upward vector */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className={icon}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8.5 8.5V17.4C8.5 21.7 11.7 24.5 16 24.5C20.3 24.5 23.5 21.7 23.5 17.4V10.5"
              stroke="#5A298A"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M19.8 11.6L23.5 7.5L27.2 11.6"
              stroke="#7C3AED"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );

    case 'angelone':
      return (
        <div
          className={`${box} bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          {/* Angel One ascending orange apex A mark */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className={icon}
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M16 6L25.5 25H20.8L16 14.8L11.2 25H6.5L16 6Z"
              fill="#F97316"
            />
            <path
              d="M13 20.5H20.5L18.8 24H11.5L13 20.5Z"
              fill="#0EA5E9"
            />
          </svg>
        </div>
      );
  }
};
