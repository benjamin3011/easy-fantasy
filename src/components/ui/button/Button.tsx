import { ReactNode, ButtonHTMLAttributes } from "react";

// Extend native button props (so we get things like `type`, `disabled`, `onClick`, etc.)
// and keep our own convenience props on top.
export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  children: ReactNode; // Button text or content
  size?: "sm" | "md" | "lg"; // Button size (lg for mobile-optimized)
  variant?: "primary" | "outline" | "destructive"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  className?: string; // Tailwind / extra classes
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  className = "",
  type = "button", // default html button type
  disabled = false,
  ...rest // pick up the remaining native button props automatically (onClick, etc.)
}) => {
  // Size Classes - Mobile-first with proper touch targets (44px minimum)
  const sizeClasses = {
    sm: "px-4 py-3 text-sm min-h-[44px]", // Mobile-safe minimum
    md: "px-5 py-3.5 text-sm min-h-[44px]", // Mobile-safe minimum
    lg: "px-6 py-4 text-base min-h-[48px]", // Extra large for mobile
  } as const;

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300",
    outline:
      "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300",
    destructive:
      "bg-red-600 text-white shadow-theme-xs hover:bg-red-700 disabled:bg-red-400",
  } as const;

  // Handle touch feedback
  const handleTouchStart = () => {
    if (!disabled && 'vibrate' in navigator) {
      navigator.vibrate?.(5); // Light haptic feedback
    }
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition-all duration-150 ease-out touch-manipulation ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${
        disabled 
          ? "cursor-not-allowed opacity-50" 
          : "active:scale-95 hover:scale-105 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
      }`}
      disabled={disabled}
      onTouchStart={handleTouchStart}
      {...rest}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
