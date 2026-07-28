"use client";

import React from "react";
import { type LucideIcon } from "lucide-react";

export interface Button3DProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "xl";
  fullWidth?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
}

export const Button3D = React.forwardRef<HTMLButtonElement, Button3DProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      icon,
      iconRight,
      loading = false,
      disabled,
      children,
      className = "",
      style,
      onClick,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      relative flex items-center justify-center font-mono font-bold
      rounded-xl border transition-all duration-150
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
      active:translate-y-[3px] active:shadow-[0_3px_0_0_#020617,0_4px_12px_rgba(0,0,0,0.3)]
      disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:shadow-[0_6px_0_0_#020617,0_12px_20px_rgba(0,0,0,0.5)]
      select-none
    `;

    const variantStyles = {
      primary: `
        bg-gradient-to-b from-slate-800 to-slate-900
        border-slate-700 text-white
        shadow-[0_6px_0_0_#020617,0_12px_20px_rgba(0,0,0,0.5)]
        hover:from-slate-700 hover:to-slate-800 hover:border-slate-600
        hover:shadow-[0_6px_0_0_#020617,0_16px_24px_rgba(0,0,0,0.6)]
      `,
      secondary: `
        bg-slate-950/80 border-slate-800 text-slate-300
        shadow-[0_4px_0_0_#020617,0_8px_16px_rgba(0,0,0,0.4)]
        hover:bg-slate-900 hover:border-slate-700
        hover:shadow-[0_4px_0_0_#020617,0_12px_20px_rgba(0,0,0,0.5)]
      `,
      danger: `
        bg-gradient-to-b from-rose-900/80 to-rose-950
        border-rose-800 text-rose-100
        shadow-[0_6px_0_0_#020617,0_12px_20px_rgba(0,0,0,0.5)]
        hover:from-rose-800 hover:to-rose-900 hover:border-rose-700
        hover:shadow-[0_6px_0_0_#020617,0_16px_24px_rgba(239,68,68,0.2)]
      `,
      ghost: `
        bg-transparent border-transparent text-slate-400
        shadow-none
        hover:bg-slate-900/50 hover:text-white
        active:bg-slate-800
      `,
    };

    const sizeStyles = {
      sm: "px-4 py-2 text-xs gap-1.5",
      md: "px-5 py-2.5 text-sm gap-2",
      lg: "px-7 py-3.5 text-base gap-2.5",
      xl: "px-9 py-4.5 text-lg gap-3",
    };

    const widthStyle = fullWidth ? "w-full" : "w-auto";

    const renderContent = () => {
      if (loading) {
        return (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Procesando...</span>
          </span>
        );
      }

      return (
        <span className="flex items-center gap-2">
          {icon && <span className="flex-shrink-0" aria-hidden="true">{React.createElement(icon, { className: "w-4 h-4" })}</span>}
          <span className="relative z-10">{children}</span>
          {iconRight && <span className="flex-shrink-0" aria-hidden="true">{React.createElement(iconRight, { className: "w-4 h-4" })}</span>}
        </span>
      );
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
        style={style}
        disabled={disabled || loading}
        onClick={onClick}
        {...props}
      >
        {renderContent()}
      </button>
    );
  }
);

Button3D.displayName = "Button3D";