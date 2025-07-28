import { useState } from 'react';

interface FirstLineupStepProps {
  onNext: () => void;
  onPrevious: () => void;
}

export default function FirstLineupStep({ onNext }: FirstLineupStepProps) {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  const handleStepComplete = (stepNumber: number) => {
    if (!completedSteps.includes(stepNumber)) {
      setCompletedSteps([...completedSteps, stepNumber]);
    }
  };

  const isStepCompleted = (stepNumber: number) => completedSteps.includes(stepNumber);
  const allStepsCompleted = completedSteps.length >= 3;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Your First Lineup
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Let's walk through setting up a lineup together
        </p>
      </div>

      {/* Interactive Steps */}
      <div className="space-y-4">
        
        {/* Step 1: Navigate to Lineup */}
        <div className={`border-2 rounded-lg p-4 transition-all duration-200 ${
          isStepCompleted(1) 
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }`}>
          <div className="flex items-start space-x-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              isStepCompleted(1)
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              {isStepCompleted(1) ? '✓' : '1'}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Go to the Lineup Page
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Click on "Lineup" in the navigation to start setting your weekly picks.
              </p>
              {!isStepCompleted(1) && (
                <button
                  onClick={() => handleStepComplete(1)}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                >
                  I found the Lineup page
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Fill Your Lineup */}
        <div className={`border-2 rounded-lg p-4 transition-all duration-200 ${
          isStepCompleted(2) 
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }`}>
          <div className="flex items-start space-x-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              isStepCompleted(2)
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              {isStepCompleted(2) ? '✓' : '2'}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Pick Your 8 Players/Teams
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Click on each empty slot to see available players. Don't overthink it - just pick players you know!
              </p>
              
              {/* Helpful tips */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3 mb-3">
                <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-2">💡 Quick Tips:</h4>
                <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Look for players with high projected points</li>
                  <li>• Avoid players marked as "Out" or "Doubtful"</li>
                  <li>• Teams playing at home often score more</li>
                  <li>• Check the usage counter (you can only pick each player 5 times per season)</li>
                </ul>
              </div>
              
              {!isStepCompleted(2) && (
                <button
                  onClick={() => handleStepComplete(2)}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                >
                  I filled my lineup
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step 3: Choose Captain */}
        <div className={`border-2 rounded-lg p-4 transition-all duration-200 ${
          isStepCompleted(3) 
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
        }`}>
          <div className="flex items-start space-x-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
              isStepCompleted(3)
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              {isStepCompleted(3) ? '✓' : '3'}
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Select Your Captain ⭐
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Click the star (⭐) next to your best player to make them captain for bonus points!
              </p>
              
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded p-3 mb-3">
                <h4 className="font-medium text-yellow-900 dark:text-yellow-100 text-sm mb-2">🎯 Captain Strategy:</h4>
                <ul className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1">
                  <li>• Pick your highest-scoring player as captain</li>
                  <li>• QBs and top RBs are usually good captain choices</li>
                  <li>• Captain gets 1.5x points, so choose wisely!</li>
                  <li>• You can change your captain anytime before games start</li>
                </ul>
              </div>
              
              {!isStepCompleted(3) && (
                <button
                  onClick={() => handleStepComplete(3)}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                >
                  I picked my captain
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Success Message */}
      {allStepsCompleted && (
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg p-6 text-white text-center">
          <div className="text-4xl mb-2">🎉</div>
          <h3 className="text-xl font-bold mb-2">Awesome! You're Ready to Play!</h3>
          <p className="text-green-100">
            You've set up your first lineup. Remember to save it and check back each week to make new picks!
          </p>
        </div>
      )}

      {/* Additional Tips */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">📚 What's Next?</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start space-x-2">
            <div className="text-blue-600 dark:text-blue-400">💾</div>
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Save Early & Often:</span>
              <span className="text-gray-600 dark:text-gray-300"> Your lineup auto-saves, but double-check before games start</span>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="text-blue-600 dark:text-blue-400">🔄</div>
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Weekly Refresh:</span>
              <span className="text-gray-600 dark:text-gray-300"> Set new lineups every week for different matchups</span>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="text-blue-600 dark:text-blue-400">📊</div>
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Track Performance:</span>
              <span className="text-gray-600 dark:text-gray-300"> Check your scores and learn what works</span>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <div className="text-blue-600 dark:text-blue-400">🏆</div>
            <div>
              <span className="font-medium text-gray-900 dark:text-white">Have Fun:</span>
              <span className="text-gray-600 dark:text-gray-300"> It's about enjoying games with friends!</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onNext}
          disabled={!allStepsCompleted}
          className={`px-6 py-2 font-medium rounded-lg transition-all duration-200 ${
            allStepsCompleted
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }`}
        >
          {allStepsCompleted ? 'Next: Learn about Tips →' : 'Complete the steps above first'}
        </button>
      </div>
    </div>
  );
} 