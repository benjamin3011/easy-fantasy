import { useState } from "react";

interface SwitchProps {
  label: string;
  labelPosition?: "left" | "right";
  defaultChecked?: boolean;
  checked?: boolean; // Add controlled mode support
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  color?: "blue" | "gray"; // Added prop to toggle color theme
}

const Switch: React.FC<SwitchProps> = ({
  label,
  labelPosition = "right",
  defaultChecked = false,
  checked,
  disabled = false,
  onChange,
  color = "blue", // Default to blue color
}) => {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  
  // Use controlled value if provided, otherwise use internal state
  const isChecked = checked !== undefined ? checked : internalChecked;

  const handleToggle = () => {
    if (disabled) return;
    const newCheckedState = !isChecked;
    
    // Only update internal state if not controlled
    if (checked === undefined) {
      setInternalChecked(newCheckedState);
    }
    
    if (onChange) {
      onChange(newCheckedState);
    }
  };

  const switchColors =
    color === "blue"
      ? {
          background: isChecked
            ? "bg-brand-500 "
            : "bg-gray-200 dark:bg-white/10", // Blue version
          knob: isChecked
            ? "translate-x-full bg-white"
            : "translate-x-0 bg-white",
        }
      : {
          background: isChecked
            ? "bg-gray-800 dark:bg-white/10"
            : "bg-gray-200 dark:bg-white/10", // Gray version
          knob: isChecked
            ? "translate-x-full bg-white"
            : "translate-x-0 bg-white",
        };

  // Handle touch feedback
  const handleTouchStart = () => {
    if (!disabled && 'vibrate' in navigator) {
      navigator.vibrate?.(5);
    }
  };

  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-3 text-sm font-medium min-h-[44px] py-2 ${
        disabled ? "text-gray-400" : "text-gray-700 dark:text-gray-400"
      }`}
      onClick={handleToggle} // Toggle when the label itself is clicked
      onTouchStart={handleTouchStart}
    >
      {labelPosition === "left" && <span className="flex-1">{label}</span>}
      <div className="relative flex-shrink-0">
        <div
          className={`block transition-all duration-150 ease-linear h-7 w-12 rounded-full touch-manipulation ${
            disabled
              ? "bg-gray-100 pointer-events-none dark:bg-gray-800"
              : switchColors.background
          }`}
        ></div>
        <div
          className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full shadow-theme-sm duration-150 ease-linear transform transition-transform ${switchColors.knob}`}
        ></div>
      </div>
      {labelPosition === "right" && <span className="flex-1">{label}</span>}
    </label>
  );
};

export default Switch;
