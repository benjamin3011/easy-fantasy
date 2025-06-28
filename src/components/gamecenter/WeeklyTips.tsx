import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import { db, functions } from '../../firebase/firebase';

interface TippableGame {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  gameTime: number;
  homeWinProbability: number;
  awayWinProbability: number;
  spread: number;
  total: number;
  gameDate: string;
}

interface WeeklyTipsPoll {
  leagueId: string;
  season: number;
  week: number;
  games: TippableGame[];
  isLocked: boolean;
  lockTime: { seconds: number };
  createdAt: { seconds: number };
  lastUpdated: { seconds: number };
}

interface UserTip {
  gameId: string;
  pick: 'home' | 'away';
  submittedAt: { seconds: number };
}

interface UserTipsSubmission {
  userId: string;
  leagueId: string;
  season: number;
  week: number;
  tips: UserTip[];
  totalGames: number;
  submittedAt: { seconds: number };
}

interface WeeklyTipsProps {
  leagueId: string;
  week: number;
  season: number;
}

export const WeeklyTips: React.FC<WeeklyTipsProps> = ({ leagueId, week, season }) => {
  const { user } = useAuth();
  const [tipsPoll, setTipsPoll] = useState<WeeklyTipsPoll | null>(null);
  const [userTips, setUserTips] = useState<Record<string, 'home' | 'away'>>({});
  const [existingTips, setExistingTips] = useState<UserTipsSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Subscribe to tips poll
  useEffect(() => {
    if (!leagueId || !week || !season) return;

    const docId = `${leagueId}_week_${week}_season_${season}`;
    const unsubscribe = onSnapshot(
      doc(db, 'weeklyTips', docId),
      (doc) => {
        if (doc.exists()) {
          setTipsPoll(doc.data() as WeeklyTipsPoll);
        } else {
          setTipsPoll(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching tips poll:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [leagueId, week, season]);

  // Subscribe to user's existing tips
  useEffect(() => {
    if (!tipsPoll || !user?.uid) return;

    const docId = `${leagueId}_week_${week}_season_${season}`;
    const unsubscribe = onSnapshot(
      doc(db, 'weeklyTips', docId, 'userTips', user.uid),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as UserTipsSubmission;
          setExistingTips(data);
          
          // Populate current tips with existing ones
          const currentTips: Record<string, 'home' | 'away'> = {};
          data.tips.forEach(tip => {
            currentTips[tip.gameId] = tip.pick;
          });
          setUserTips(currentTips);
        }
      }
    );

    return () => unsubscribe();
  }, [tipsPoll, user?.uid, leagueId, week, season]);

  const handleTipChange = (gameId: string, pick: 'home' | 'away') => {
    if (!tipsPoll?.isLocked) {
      setUserTips(prev => ({
        ...prev,
        [gameId]: pick
      }));
    }
  };

  const submitTips = async () => {
    if (!user?.uid || !tipsPoll) return;

    setSubmitting(true);
    setMessage(null);

    try {
      const submitTipsFunction = httpsCallable(functions, 'submitTips');
      const result = await submitTipsFunction({
        leagueId,
        week,
        season,
        tips: userTips
      });

      const data = result.data as { success: boolean; message: string };
      
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to submit tips: ${error}` });
    } finally {
      setSubmitting(false);
    }
  };

  const formatGameTime = (epoch: number) => {
    return new Date(epoch).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const formatSpread = (spread: number) => {
    if (spread === 0) return 'EVEN';
    return spread > 0 ? `-${spread}` : `+${Math.abs(spread)}`;
  };

  const isLocked = Boolean(tipsPoll?.isLocked || (tipsPoll && Date.now() > tipsPoll.lockTime.seconds * 1000));

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center p-8 sm:p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Loading game predictions...</p>
      </div>
    );
  }

  if (!tipsPoll) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
          No Tips Poll Available
        </h3>
        <p className="text-yellow-700 dark:text-yellow-300 text-sm sm:text-base">
          Game tipping for Week {week} hasn't been set up yet.
        </p>
        <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-2">
          Check back later or contact your league commissioner.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        {/* Mobile-First Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 sm:p-6 rounded-t-lg">
          <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">
            Week {week} Game Predictions
          </h2>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-blue-100 text-sm sm:text-base">
              Make your picks before games start!
            </p>
            {isLocked && (
              <span className="bg-red-500 text-white px-2 py-1 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1">
                🔒 <span className="hidden sm:inline">LOCKED</span>
              </span>
            )}
          </div>
        </div>

        {/* Lock Timer */}
        {!isLocked && tipsPoll.lockTime && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 p-3 sm:p-4">
            <div className="flex items-center gap-2">
              <div className="text-orange-600 text-lg">⏰</div>
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">
                  <strong>Tips lock:</strong> {formatGameTime(tipsPoll.lockTime.seconds * 1000)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status Messages */}
        {message && (
          <div className={`p-3 sm:p-4 border-l-4 ${
            message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 border-green-400 text-green-700 dark:text-green-300' :
            message.type === 'error' ? 'bg-red-50 dark:bg-red-900/20 border-red-400 text-red-700 dark:text-red-300' :
            'bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-700 dark:text-blue-300'
          }`}>
            <div className="flex items-center gap-2">
              <div className="text-lg">
                {message.type === 'success' ? '✅' : message.type === 'error' ? '❌' : 'ℹ️'}
              </div>
              <p className="text-sm sm:text-base">{message.text}</p>
            </div>
          </div>
        )}

        {/* Games List */}
        <div className="p-3 sm:p-6">
          <div className="space-y-3 sm:space-y-4">
            {tipsPoll.games.map((game) => (
              <div key={game.gameId} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                {/* Game Info Header */}
                <div className="bg-gray-50 dark:bg-gray-700 px-3 sm:px-4 py-2 flex items-center justify-between">
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-medium">
                    {formatGameTime(game.gameTime)}
                  </div>
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                    O/U: {game.total}
                  </div>
                </div>

                {/* Team Selection - Mobile: Stack vertically, Desktop: Side by side */}
                <div className="p-3 sm:p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {/* Away Team */}
                    <button
                      onClick={() => handleTipChange(game.gameId, 'away')}
                      disabled={isLocked}
                      className={`p-3 sm:p-4 rounded-lg border-2 transition-all min-h-[80px] sm:min-h-[100px] ${
                        userTips[game.gameId] === 'away'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-200 dark:ring-blue-800'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                      } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
                    >
                      <div className="text-center">
                        <div className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">
                          @ {game.awayTeam}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {formatSpread(-game.spread)}
                        </div>
                        <div className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">
                          {game.awayWinProbability}% win chance
                        </div>
                        {userTips[game.gameId] === 'away' && (
                          <div className="mt-2 text-blue-600 dark:text-blue-400">
                            ✓ Selected
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Home Team */}
                    <button
                      onClick={() => handleTipChange(game.gameId, 'home')}
                      disabled={isLocked}
                      className={`p-3 sm:p-4 rounded-lg border-2 transition-all min-h-[80px] sm:min-h-[100px] ${
                        userTips[game.gameId] === 'home'
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md ring-2 ring-blue-200 dark:ring-blue-800'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                      } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'}`}
                    >
                      <div className="text-center">
                        <div className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">
                          {game.homeTeam}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {formatSpread(game.spread)}
                        </div>
                        <div className="text-xs sm:text-sm font-medium text-blue-600 dark:text-blue-400">
                          {game.homeWinProbability}% win chance
                        </div>
                        {userTips[game.gameId] === 'home' && (
                          <div className="mt-2 text-blue-600 dark:text-blue-400">
                            ✓ Selected
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          {!isLocked && (
            <div className="mt-6 text-center">
              <button
                onClick={submitTips}
                disabled={submitting || Object.keys(userTips).length === 0}
                className={`w-full sm:w-auto px-6 sm:px-8 py-3 rounded-lg font-semibold text-white transition-colors min-h-[48px] ${
                  submitting || Object.keys(userTips).length === 0
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {submitting ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Submitting...
                  </div>
                ) : (
                  `Submit ${Object.keys(userTips).length} Tip${Object.keys(userTips).length !== 1 ? 's' : ''}`
                )}
              </button>
              
              {Object.keys(userTips).length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Select your picks to submit
                </p>
              )}
            </div>
          )}

          {/* Existing Tips Summary */}
          {existingTips && (
            <div className="mt-6 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-lg">📊</div>
                <h4 className="font-semibold text-gray-800 dark:text-gray-200">Your Tips Summary</h4>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p>
                  <span className="font-medium">{existingTips.tips.length}</span> of <span className="font-medium">{existingTips.totalGames}</span> picks submitted
                </p>
                <p>
                  Last updated: {new Date(existingTips.submittedAt.seconds * 1000).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 