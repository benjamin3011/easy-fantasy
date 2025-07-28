{/* Removed unused React import */}

interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="text-center space-y-6">
      {/* Hero Section */}
      <div className="space-y-4">
        <div className="text-6xl">🏈</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome to Easy Fantasy!
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Fantasy football that's actually <span className="font-semibold text-blue-600">simple</span> and <span className="font-semibold text-blue-600">fun</span>
        </p>
      </div>

      {/* What Makes It Different */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 text-left">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
          Why Easy Fantasy is Different
        </h3>
        
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="text-2xl">⚡</div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">No Drafts, No Trades, No Stress</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pick any NFL players each week. No complicated transactions or waiver wires.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="text-2xl">🎯</div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Simple 8-Slot System</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Just 8 picks per week: 4 individual players + 4 team units. Easy to understand.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="text-2xl">⭐</div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Captain Strategy</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pick one player as your captain for bonus points. Strategic but not overwhelming.
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="text-2xl">🎲</div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Smart Usage Limits</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Each player/team can only be picked 5 times per season. Keeps it interesting!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          Ready to learn how it works? This quick tour will have you setting lineups like a pro in just 2 minutes! 
        </p>
        
        <button
          onClick={onNext}
          className="mx-auto block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Let's Go! 🚀
        </button>
      </div>
    </div>
  );
} 