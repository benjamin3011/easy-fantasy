import { useState, useEffect, useRef, useCallback } from 'react';
import { PositionKey, SelectableEntity } from '../../../types/lineup';
import { BackendLineupPick, SaveLineupPayload, SaveLineupResult } from '../../../types/functions';
import { saveWeeklyLineupCallable } from '../../../firebase/callables';
import { fetchUsageCounts, FirestoreWeeklySchedule, StoredLineupData } from '../../../services/lineupFetchingService';

interface UseLineupStateProps {
  userId: string | undefined;
  leagueId: string;
  week: number;
}

export const useLineupState = ({ userId, leagueId, week }: UseLineupStateProps) => {
  const [lineup, setLineup] = useState<Partial<Record<PositionKey, SelectableEntity | undefined>>>({});
  const [usageCounts, setUsageCounts] = useState<Record<string, number> | null>(null);
  const [weeklySchedule, setWeeklySchedule] = useState<FirestoreWeeklySchedule | null>(null);
  const [actualScores, setActualScores] = useState<Record<string, number>>({});
  const [lineupTotalScore, setLineupTotalScore] = useState<number | undefined>(undefined);
  
  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Error and success states
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  
  // Loading states
  const [isLoadingLineup, setIsLoadingLineup] = useState(true);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isCopyingFromLastWeek, setIsCopyingFromLastWeek] = useState(false);
  const [hasLastWeekLineup, setHasLastWeekLineup] = useState<boolean>(false);
  
  // Optimistic updates
  const [pendingOptimisticUpdates, setPendingOptimisticUpdates] = useState<Set<string>>(new Set());
  
  // Captain feature state
  const [leagueSettings, setLeagueSettings] = useState<{ enableCaptainFeature: boolean; captainPointMultiplier: number } | null>(null);
  const [designatedCaptainSlotKey, setDesignatedCaptainSlotKey] = useState<PositionKey | null>(null);
  const [selectedCaptainPlayerIdForSave, setSelectedCaptainPlayerIdForSave] = useState<string | null>(null);

  // Auto-save function with debouncing
  const autoSaveLineup = useCallback(async (
    currentLineup: Partial<Record<PositionKey, SelectableEntity | undefined>>, 
    captainId?: string | null
  ) => {
    if (!userId || !leagueId || week === undefined) return;

    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set up debounced save (500ms delay)
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        setAutoSaveStatus('saving');

        const picksForBackend: Partial<Record<PositionKey, BackendLineupPick>> = {};
        for (const key in currentLineup) {
          if (Object.prototype.hasOwnProperty.call(currentLineup, key)) {
            const entity = currentLineup[key as PositionKey];
            if (entity) {
              picksForBackend[key as PositionKey] = { id: entity.id, type: entity.entityType };
            }
          }
        }

        const payload: SaveLineupPayload = {
          leagueId,
          week,
          picks: picksForBackend,
          captainPlayerId: captainId || null,
        };

        const result = await saveWeeklyLineupCallable(payload);
        const data = result.data as SaveLineupResult;

        if (data.success) {
          setAutoSaveStatus('saved');
          setSaveError(null);
          
          // Update usage counts after successful save
          if (userId && leagueId) {
            const newUsageCounts = await fetchUsageCounts(userId, leagueId);
            setUsageCounts(newUsageCounts);
          }

          // Clear saved status after 2 seconds
          setTimeout(() => {
            setAutoSaveStatus('idle');
          }, 2000);
        } else {
          setAutoSaveStatus('error');
          setSaveError(data.message || "Failed to auto-save lineup.");
        }
      } catch (error) {
        console.error("Error auto-saving lineup:", error);
        setAutoSaveStatus('error');
        if (error instanceof Error) {
          setSaveError(error.message || "An unexpected error occurred while auto-saving.");
        } else {
          setSaveError("An unexpected error occurred while auto-saving.");
        }
      }
    }, 500); // 500ms debounce
  }, [userId, leagueId, week]);

  // Handle captain designation
  const handleDesignateCaptainSlot = useCallback((slotKey: PositionKey | null) => {
    setDesignatedCaptainSlotKey(slotKey);
    let newCaptainId: string | null = null;
    
    if (slotKey) {
      const playerInSlot = lineup[slotKey];
      if (playerInSlot && playerInSlot.entityType === 'player') {
        newCaptainId = playerInSlot.id;
        setSelectedCaptainPlayerIdForSave(newCaptainId);
      } else {
        setSelectedCaptainPlayerIdForSave(null); 
      }
    } else {
      setSelectedCaptainPlayerIdForSave(null);
    }
    
    setSaveError(null);
    setSaveSuccess(null);
    
    // Auto-save when captain changes
    autoSaveLineup(lineup, newCaptainId);
  }, [lineup, autoSaveLineup]);

  // Handle lineup data updates
  const handleLineupData = useCallback((data: StoredLineupData) => {
    // Note: This is a simplified version for the hook
    // The actual entity reconstruction should be done in the component
    // since it requires async calls to fetch entity details
    
    setLineupTotalScore(data.totalActualPoints || undefined);
    
    // Handle captain data
    if (data.captainPlayerId) {
      setSelectedCaptainPlayerIdForSave(data.captainPlayerId);
    } else {
      setSelectedCaptainPlayerIdForSave(null);
      setDesignatedCaptainSlotKey(null);
    }

    setIsLoadingLineup(false);
  }, []);

  // Handle entity selection
  const handleEntitySelected = useCallback((selectedEntity: SelectableEntity, positionKey: PositionKey) => {
    const newLineup = { ...lineup, [positionKey]: selectedEntity };
    setLineup(newLineup);
    
    // Handle captain logic if this is a player selection
    let captainId = selectedCaptainPlayerIdForSave;
    if (selectedEntity.entityType === 'player' && designatedCaptainSlotKey === positionKey) {
      captainId = selectedEntity.id;
      setSelectedCaptainPlayerIdForSave(captainId);
    }
    
    autoSaveLineup(newLineup, captainId);
  }, [lineup, selectedCaptainPlayerIdForSave, designatedCaptainSlotKey, autoSaveLineup]);

  // Handle slot clearing
  const handleClearSlot = useCallback((positionKeyToClear: PositionKey) => {
    const newLineup = { ...lineup };
    delete newLineup[positionKeyToClear];
    setLineup(newLineup);
    
    // Handle captain logic if clearing captain slot
    let captainId = selectedCaptainPlayerIdForSave;
    if (designatedCaptainSlotKey === positionKeyToClear) {
      captainId = null;
      setSelectedCaptainPlayerIdForSave(null);
      setDesignatedCaptainSlotKey(null);
    }
    
    autoSaveLineup(newLineup, captainId);
  }, [lineup, selectedCaptainPlayerIdForSave, designatedCaptainSlotKey, autoSaveLineup]);

  // Clear all slots
  const handleClearAllSlots = useCallback(() => {
    setLineup({});
    setDesignatedCaptainSlotKey(null);
    setSelectedCaptainPlayerIdForSave(null);
    autoSaveLineup({}, null);
  }, [autoSaveLineup]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    lineup,
    setLineup,
    usageCounts,
    setUsageCounts,
    weeklySchedule,
    setWeeklySchedule,
    actualScores,
    setActualScores,
    lineupTotalScore,
    setLineupTotalScore,
    autoSaveStatus,
    saveError,
    setSaveError,
    saveSuccess,
    setSaveSuccess,
    isLoadingLineup,
    setIsLoadingLineup,
    isRandomizing,
    setIsRandomizing,
    isCopyingFromLastWeek,
    setIsCopyingFromLastWeek,
    hasLastWeekLineup,
    setHasLastWeekLineup,
    pendingOptimisticUpdates,
    setPendingOptimisticUpdates,
    leagueSettings,
    setLeagueSettings,
    designatedCaptainSlotKey,
    selectedCaptainPlayerIdForSave,
    
    // Actions
    autoSaveLineup,
    handleDesignateCaptainSlot,
    handleLineupData,
    handleEntitySelected,
    handleClearSlot,
    handleClearAllSlots,
  };
}; 