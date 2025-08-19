import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({ isOpen, onClose, title, children, className = '' }: BottomSheetProps) {
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when bottom sheet is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[99999] lg:hidden transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop with white blur effect */}
      <div 
        className={`absolute inset-0 backdrop-blur-sm bg-white/70 dark:bg-gray-900/70 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      {/* Bottom Sheet */}
      <div 
        className={`absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md rounded-t-2xl border-t border-gray-200/50 dark:border-gray-800/50 shadow-2xl transform transition-all duration-500 ${isOpen ? 'translate-y-0 scale-100' : 'translate-y-full scale-95'} ${className}`}
        style={{
          transitionTimingFunction: isOpen ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
          transitionDelay: isOpen ? '50ms' : '0ms'
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center py-4">
          <div className="w-12 h-1.5 bg-gray-400/60 dark:bg-gray-500/60 rounded-full transition-colors duration-200" />
        </div>
        
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 pb-4 border-b border-gray-200/60 dark:border-gray-700/60">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <button
              onClick={onClose}
              className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-all duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Content */}
        <div className="px-5 pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
