import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import WelcomeStep from './WelcomeStep';
import BasicsStep from './BasicsStep';
import FirstLineupStep from './FirstLineupStep';
import TipsStep from './TipsStep';
import Button from '../ui/button/Button';

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 4;

export default function OnboardingFlow({ isOpen, onComplete, onSkip }: OnboardingFlowProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);

  // Reset to step 1 when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
      setIsCompleting(false);
    }
  }, [isOpen]);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    
    // Mark onboarding as completed in localStorage
    localStorage.setItem('easy-fantasy-onboarding-completed', 'true');
    
    // Optional: Also save to user profile in Firestore
    try {
      if (user?.uid) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../../firebase/firebase');
        await updateDoc(doc(db, 'users', user.uid), {
          onboardingCompleted: true,
          onboardingCompletedAt: new Date()
        });
      }
    } catch (error) {
      console.warn('Failed to save onboarding completion to Firestore:', error);
      // Continue anyway - localStorage is sufficient
    }
    
    setIsCompleting(false);
    onComplete();
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <WelcomeStep onNext={handleNext} />;
      case 2:
        return <BasicsStep onNext={handleNext} onPrevious={handlePrevious} />;
      case 3:
        return <FirstLineupStep onNext={handleNext} onPrevious={handlePrevious} />;
      case 4:
        return <TipsStep onNext={handleNext} onPrevious={handlePrevious} />;
      default:
        return <WelcomeStep onNext={handleNext} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-md flex items-center justify-center z-[100000] p-4 animate-in fade-in duration-300">
      <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 dark:border-gray-700/50 max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
        {/* Header with Progress */}
        <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50 bg-white/50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Getting Started with Easy Fantasy
            </h2>
            <button
              onClick={onSkip}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Skip for now
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              Step {currentStep} of {TOTAL_STEPS}
            </span>
            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {renderCurrentStep()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/80 dark:bg-gray-800/30 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="min-w-20"
            >
              Previous
            </Button>
            
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                onClick={onSkip}
                className="min-w-20"
              >
                Skip
              </Button>
              <Button
                onClick={handleNext}
                disabled={isCompleting}
                className="min-w-24"
              >
                {isCompleting ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Finishing...</span>
                  </div>
                ) : currentStep === TOTAL_STEPS ? (
                  "Get Started!"
                ) : (
                  "Next"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 