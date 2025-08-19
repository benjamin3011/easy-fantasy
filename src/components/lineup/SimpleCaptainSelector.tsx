import React, { useRef, useCallback, useMemo } from 'react';
import { useLineupStore } from '../../store/lineupStore';
import { PositionKey, SelectablePlayer, SelectableEntity } from '../../types/lineup';
import { POSITIONS_CONFIG } from '../../config/positions';
import { getCaptainLockStatus } from '../../utils/gameLockHelper';
import { useLineupPoints } from '../../context/LineupPointsContext';
import { getEntityDisplayPoints } from '../../utils/lineupPointsDisplay';

interface SimpleCaptainSelectorProps {
  captainPointMultiplier: number;
}

const SimpleCaptainSelector: React.FC<SimpleCaptainSelectorProps> = React.memo(({ captainPointMultiplier }) => {
  const { 
    lineup, 
    designatedCaptainSlotKey, 
    setCaptain 
  } = useLineupStore();
  
  const { hasGameStarted, actualPoints, captainSlotKey } = useLineupPoints();
  const lastClickRef = useRef<number>(0);

  // Get all filled lineup slots, but only show players for captain selection
  const filledSlots = useMemo(() => 
    POSITIONS_CONFIG.filter(pos => lineup[pos.key] !== undefined), 
    [lineup]
  );
  
  const playerSlots = useMemo(() => 
    filledSlots.filter(pos => {
      const entity = lineup[pos.key];
      return entity && entity.entityType === 'player';
    }), 
    [filledSlots, lineup]
  );

  // Check if captain selection is locked
  const captainLockStatus = useMemo(() => getCaptainLockStatus(lineup, designatedCaptainSlotKey), [lineup, designatedCaptainSlotKey]);

  const handleCaptainSelect = useCallback((positionKey: PositionKey, entity: SelectableEntity) => {
    // Prevent selection if captain is locked
    if (captainLockStatus.isLocked) {
      return;
    }
    
    // Debounce rapid clicks to prevent race conditions
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      return; // Ignore clicks within 300ms
    }
    lastClickRef.current = now;
    
    // Only allow player selection as captain
    if (entity.entityType === 'player') {
      // If clicking the same captain, clear it instead
      if (designatedCaptainSlotKey === positionKey) {
        setCaptain(null, null);
      } else {
        setCaptain(positionKey, entity.id);
      }
    }
  }, [designatedCaptainSlotKey, setCaptain, captainLockStatus.isLocked]);

  const handleClearCaptain = useCallback(() => {
    // Prevent clearing if captain is locked
    if (captainLockStatus.isLocked) {
      return;
    }
    
    // Debounce rapid clicks
    const now = Date.now();
    if (now - lastClickRef.current < 300) {
      return;
    }
    lastClickRef.current = now;
    
    setCaptain(null, null);
  }, [setCaptain, captainLockStatus.isLocked]);

  if (filledSlots.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.915a1 1 0 00.95-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Choose Your Captain
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Add players to your lineup first, then select your captain for bonus points
          </p>
        </div>
      </div>
    );
  }

  if (playerSlots.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No Players Available
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Only players can be selected as captain. Add some players to your lineup first!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Captain Selection
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose one player to receive bonus points
          </p>
        </div>
        
        {designatedCaptainSlotKey && (
          <button
            onClick={handleClearCaptain}
            disabled={captainLockStatus.isLocked}
            className={`text-sm ${
              captainLockStatus.isLocked
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
            }`}
          >
            {captainLockStatus.isLocked ? 'Locked' : 'Clear Captain'}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {playerSlots.map((position) => {
          const entity = lineup[position.key];
          const isCaptain = designatedCaptainSlotKey === position.key;
          
          if (!entity || entity.entityType !== 'player') return null;

          return (
            <div
              key={position.key}
              className={`
                p-4 rounded-lg border-2 transition-all duration-200 
                flex items-center justify-between min-h-[80px]
                ${captainLockStatus.isLocked 
                  ? 'cursor-not-allowed opacity-60' 
                  : 'cursor-pointer hover:shadow-md active:scale-[0.98]'
                }
                ${isCaptain 
                  ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-400' 
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
              onClick={() => handleCaptainSelect(position.key, entity)}
              title={captainLockStatus.isLocked ? captainLockStatus.message : undefined}
            >
              <div className="flex items-center gap-4">
                {/* Captain Crown Icon */}
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                  ${isCaptain 
                    ? 'bg-yellow-400 text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }
                `}>
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 3.75C12.2163 3.75 12.4221 3.84339 12.5645 4.00621L16.7116 8.74719L20.775 5.42099C21.0116 5.22731 21.342 5.19665 21.6102 5.3435C21.8784 5.49035 22.0306 5.78531 21.9949 6.08898L20.6507 17.5129C20.5174 18.646 19.5571 19.5 18.4162 19.5H5.58388C4.44295 19.5 3.48261 18.646 3.34929 17.5129L2.00516 6.08898C1.96943 5.78531 2.12162 5.49035 2.38981 5.3435C2.658 5.19665 2.98849 5.22731 3.22509 5.42099L7.28842 8.74719L11.4355 4.00621C11.5779 3.84339 11.7837 3.75 12 3.75ZM12 5.63914L7.93953 10.2811C7.6731 10.5857 7.21308 10.624 6.89995 10.3677L3.71188 7.75795L4.46183 14.1319H19.5382L20.2882 7.75795L17.1001 10.3677C16.787 10.624 16.3269 10.5857 16.0605 10.2811L12 5.63914ZM19.3617 15.6319H4.63832L4.83902 17.3376C4.88346 17.7153 5.20357 18 5.58388 18H18.4162C18.7965 18 19.1166 17.7153 19.161 17.3376L19.3617 15.6319Z"/>
                  </svg>
                </div>

                {/* Entity Info - Simplified */}
                <div className="flex-1 min-w-0 pr-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-1 leading-tight h-10 flex items-start">
                    <span className="line-clamp-2">
                      {entity.name}
                    </span>
                  </h4>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {(entity as SelectablePlayer).position}
                  </div>
                </div>
              </div>

              {/* Stats - Fixed Height */}
              <div className="text-right flex-shrink-0 h-12 flex flex-col justify-center">
                {(() => {
                  const displayPoints = getEntityDisplayPoints(
                    entity,
                    hasGameStarted,
                    actualPoints[entity.id],
                    position.key,
                    captainSlotKey,
                    captainPointMultiplier
                  );
                  
                  const baseLabel = displayPoints.type === 'actual' ? 'PTS' : 'PPG';
                  
                  return (
                    <>
                      <div className={`font-medium ${
                        displayPoints.type === 'actual' 
                          ? displayPoints.isCaptain 
                            ? 'text-yellow-600 dark:text-yellow-400' 
                            : 'text-blue-600 dark:text-blue-400'
                          : 'text-green-600 dark:text-green-400'
                      }`}>
                        {displayPoints.points.toFixed(1)} {baseLabel}
                      </div>
                      <div className="text-xs text-yellow-600 dark:text-yellow-400 h-4 flex items-center justify-end">
                        {displayPoints.isCaptain && (
                          <span className="flex items-center gap-1">
                            <span>⭐</span>
                            <span>{captainPointMultiplier}x</span>
                          </span>
                        )}
                        {displayPoints.isCaptain && displayPoints.type === 'ppg' && (
                          <span className="ml-2">
                            +{(entity.actualPPG * (captainPointMultiplier - 1)).toFixed(1)} bonus
                          </span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Captain Locked Warning */}
      {captainLockStatus.isLocked && (
        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
            </svg>
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <p className="font-medium">Captain Selection Locked</p>
              <p>{captainLockStatus.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Captain Info */}
      {designatedCaptainSlotKey && !captainLockStatus.isLocked && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <p className="font-medium">Captain Bonus Active</p>
              <p>Your captain will receive {captainPointMultiplier}x points for their performance</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

SimpleCaptainSelector.displayName = 'SimpleCaptainSelector';

export default SimpleCaptainSelector; 