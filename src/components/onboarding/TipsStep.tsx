{/* Removed unused React import */}

interface TipsStepProps {
  onNext: () => void;
  onPrevious: () => void;
}

export default function TipsStep({ onNext }: TipsStepProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Weekly Tips & Predictions 🎯
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Make game predictions for extra fun and bragging rights!
        </p>
      </div>

      {/* What are Tips */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
          What are Weekly Tips?
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="text-2xl">🏈</div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Game Predictions</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Predict winners of NFL games each week
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="text-2xl">🏆</div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Separate Competition</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tips scoring is separate from your lineup performance
                </p>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="text-2xl">👥</div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">League Feature</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Compare your predictions with league mates
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="text-2xl">🎉</div>
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white">Just for Fun</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No pressure - it's all about having fun with friends
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white text-center">
          How Tips Work
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Step 1 */}
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">1</span>
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Pick Winners</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Look at the weekly games and predict who will win each matchup
              </p>
            </div>
          </div>
          
          {/* Step 2 */}
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-green-600 dark:text-green-400">2</span>
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Submit Tips</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Save your predictions before games start - no changes after kickoff!
              </p>
            </div>
          </div>
          
          {/* Step 3 */}
          <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-xl font-bold text-purple-600 dark:text-purple-400">3</span>
              </div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">See Results</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                After games finish, check how you did vs your league mates
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Example Preview */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3">📱 Example: Week 8 Tips</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between bg-white dark:bg-gray-700 rounded p-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Chiefs vs Bills</span>
            </div>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1 bg-blue-600 text-white text-xs rounded">Chiefs</button>
              <span className="text-xs text-gray-500">vs</span>
              <button className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded">Bills</button>
            </div>
          </div>
          <div className="flex items-center justify-between bg-white dark:bg-gray-700 rounded p-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900 dark:text-white">Cowboys vs Eagles</span>
            </div>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded">Cowboys</button>
              <span className="text-xs text-gray-500">vs</span>
              <button className="px-3 py-1 bg-blue-600 text-white text-xs rounded">Eagles</button>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
          Click on team names to make your predictions!
        </p>
      </div>

      {/* League Commissioner Info */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <div className="text-yellow-600 dark:text-yellow-400 text-xl">👑</div>
          <div>
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200">For League Commissioners</h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
              Tips are an optional feature you can enable in your league settings. This adds an extra layer of fun beyond just lineup management!
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              💡 Tip: Enable tips to keep your league engaged even during bye weeks when lineups are easier to set.
            </p>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="text-center space-y-4">
        <h4 className="font-medium text-gray-900 dark:text-white">Ready to Start Making Tips?</h4>
        <div className="space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            If your league has tips enabled, you'll see a "Tips" tab in the navigation.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            If not, ask your league commissioner to turn it on for more fun!
          </p>
        </div>
      </div>

      {/* Completion */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg p-6 text-white text-center">
        <div className="text-4xl mb-2">🎓</div>
        <h3 className="text-xl font-bold mb-2">Congratulations!</h3>
        <p className="text-blue-100 mb-4">
          You're now ready to dominate Easy Fantasy! Time to set those lineups and make some predictions.
        </p>
        <button
          onClick={onNext}
          className="bg-white text-blue-600 font-semibold px-6 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Let's Get Started! 🚀
        </button>
      </div>
    </div>
  );
} 