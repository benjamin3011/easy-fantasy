import { useState } from 'react';

interface BasicsStepProps {
  onNext: () => void;
  onPrevious: () => void;
}

export default function BasicsStep({ onNext }: BasicsStepProps) {
  const [selectedTab, setSelectedTab] = useState<'lineup' | 'captain'>('lineup');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          The Basics: How It Works
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Two simple concepts that make Easy Fantasy unique
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        <button
          onClick={() => setSelectedTab('lineup')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-all duration-200 ${
            selectedTab === 'lineup'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          🎯 8-Slot System
        </button>
        <button
          onClick={() => setSelectedTab('captain')}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-all duration-200 ${
            selectedTab === 'captain'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          ⭐ Captain Strategy
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {selectedTab === 'lineup' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Your Weekly Lineup: Just 8 Simple Picks
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                No complicated positional requirements. Just pick the best players and teams!
              </p>
            </div>

            {/* Visual Lineup */}
            <div className="grid grid-cols-2 gap-4">
              {/* Individual Players */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-center">
                  👤 Individual Players (4)
                </h4>
                <div className="space-y-2">
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-green-500">
                    <div className="font-medium text-gray-900 dark:text-white">QB - Quarterback</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">e.g., Josh Allen, Lamar Jackson</div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-green-500">
                    <div className="font-medium text-gray-900 dark:text-white">RB - Running Back</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">e.g., Christian McCaffrey</div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-green-500">
                    <div className="font-medium text-gray-900 dark:text-white">WR - Wide Receiver</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">e.g., Tyreek Hill</div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-green-500">
                    <div className="font-medium text-gray-900 dark:text-white">TE - Tight End</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">e.g., Travis Kelce</div>
                  </div>
                </div>
              </div>

              {/* Team Units */}
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 text-center">
                  🏟️ Team Units (4)
                </h4>
                <div className="space-y-2">
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                    <div className="font-medium text-gray-900 dark:text-white">Passing Offense</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Team's passing game</div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                    <div className="font-medium text-gray-900 dark:text-white">Rushing Offense</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Team's running game</div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                    <div className="font-medium text-gray-900 dark:text-white">Defense</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Team's defensive unit</div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 rounded p-3 border-l-4 border-blue-500">
                    <div className="font-medium text-gray-900 dark:text-white">Special Teams</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Kickers, returners, etc.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <div className="text-yellow-600 dark:text-yellow-400 text-xl">💡</div>
                <div>
                  <h4 className="font-medium text-yellow-800 dark:text-yellow-200">Pro Tip</h4>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    You can pick players from any team, any week. No roster limits or complicated rules!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'captain' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Captain Strategy: Your Secret Weapon ⭐
              </h3>
              <p className="text-gray-600 dark:text-gray-300 mb-6">
                Pick one player as your captain to multiply their points!
              </p>
            </div>

            {/* Captain Example */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-4 text-center">
                How Captain Scoring Works
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border-2 border-gray-200 dark:border-gray-600">
                    <div className="text-2xl mb-2">👤</div>
                    <div className="font-medium text-gray-900 dark:text-white">Regular Player</div>
                    <div className="text-lg font-bold text-blue-600">15 points</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">No multiplier</div>
                  </div>
                </div>
                
                <div className="text-center">
                  <div className="text-3xl mb-2">→</div>
                  <div className="font-medium text-gray-600 dark:text-gray-400">Choose as Captain</div>
                </div>
                
                <div className="text-center">
                  <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg p-4 border-2 border-yellow-400">
                    <div className="text-2xl mb-2">⭐</div>
                    <div className="font-medium text-white">Captain Player</div>
                    <div className="text-lg font-bold text-white">22.5 points</div>
                    <div className="text-sm text-yellow-100">15 × 1.5 multiplier</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Strategy Tips */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <div className="text-green-600 dark:text-green-400 text-xl">✅</div>
                  <div>
                    <h4 className="font-medium text-green-800 dark:text-green-200">Good Captain Picks</h4>
                    <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      <li>• High-scoring players</li>
                      <li>• Consistent performers</li>
                      <li>• Players in good matchups</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <div className="text-red-600 dark:text-red-400 text-xl">⚠️</div>
                  <div>
                    <h4 className="font-medium text-red-800 dark:text-red-200">Captain Mistakes</h4>
                    <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                      <li>• Picking injured players</li>
                      <li>• Players on bye weeks</li>
                      <li>• Low-scoring positions</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start space-x-2">
                <div className="text-blue-600 dark:text-blue-400 text-xl">🧠</div>
                <div>
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">Remember</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Your captain choice can make or break your week. Choose wisely, but don't overthink it!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onNext}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
        >
          Got it! Show me how to set a lineup →
        </button>
      </div>
    </div>
  );
} 