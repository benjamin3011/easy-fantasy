import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { PositionKey, SelectableEntity, SelectablePlayer, SelectableTeam, PositionDetail } from '../types/lineup';
import { 
  fetchSelectablePlayers, 
  fetchSelectableTeams,
  fetchWeeklySchedule,
  FirestoreWeeklySchedule,
  fetchUsageCounts,
  listenToStoredWeeklyLineup,
  StoredLineupData,
  fetchSelectablePlayerById,
  fetchSelectableTeamById
} from '../services/lineupFetchingService';
import { saveWeeklyLineupCallable } from '../firebase/callables';
import { SaveLineupPayload, SaveLineupResult, BackendLineupPick } from '../types/functions';

interface LineupState {
  // Current lineup data
  lineup: Partial<Record<PositionKey, SelectableEntity | undefined>>;
  
  // Captain selection
  designatedCaptainSlotKey: PositionKey | null;
  selectedCaptainPlayerIdForSave: string | null;
  
  // UI state - old panel system
  isPanelOpen: boolean;
  editingPosition: string | null;
  
  // UI state - new selection panel system
  isSelectionPanelOpen: boolean;
  selectedPosition: PositionDetail | null;
  
  // Save state with auto-save
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  saveError: string | null;
  saveSuccess: string | null;
  autoSaveTimeoutId: NodeJS.Timeout | null;
  
  // Real data state - old structure
  availableEntities: Record<PositionKey, SelectableEntity[]>;
  entitiesLoading: Record<PositionKey, boolean>;
  entitiesError: Record<PositionKey, string | null>;
  
  // Real data state - new structure
  players: Record<PositionKey, SelectablePlayer[]>;
  teams: Record<PositionKey, SelectableTeam[]>;
  loadingStates: Record<PositionKey, boolean>;
  errorStates: Record<PositionKey, string | null>;
  
  usageCounts: Record<string, number>;
  weeklySchedule: FirestoreWeeklySchedule | null;
  
  // Context for data fetching and auto-save
  currentWeek: number | null;
  currentSeason: number | null;
  userId: string | null;
  leagueId: string | null;
  
  // Lineup loading state
  isLoadingLineup: boolean;
  lineupUnsubscribe: (() => void) | null;
  
  // Actions
  setLineup: (lineup: Partial<Record<PositionKey, SelectableEntity | undefined>>) => void;
  updateLineupSlot: (positionKey: PositionKey, entity: SelectableEntity | undefined) => void;
  clearLineup: () => void;
  
  setCaptain: (slotKey: PositionKey | null, playerId: string | null) => void;
  
  // Panel actions
  setPanel: (isOpen: boolean, editingPosition?: string | null) => void;
  
  // Selection panel actions
  openSelectionPanel: (position: PositionDetail) => void;
  closeSelectionPanel: () => void;
  
  // Save actions
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error', error?: string | null, success?: string | null) => void;
  autoSaveLineup: (lineup?: Partial<Record<PositionKey, SelectableEntity | undefined>>, captainId?: string | null) => Promise<void>;
  
  // Real data actions
  initializeContext: (userId: string, leagueId: string, week: number, season: number) => Promise<void>;
  fetchSelectablePlayers: (positionKey: PositionKey) => Promise<void>;
  fetchSelectableTeams: (positionKey: PositionKey) => Promise<void>;
  
  // Lineup data handling
  handleLineupData: (lineupData: StoredLineupData, schedule?: FirestoreWeeklySchedule | null) => Promise<void>;
  
  // Cleanup action
  cleanup: () => void;
}

export const useLineupStore = create<LineupState>()(
  devtools(
    (set, get) => ({
      // Initial state
      lineup: {},
      designatedCaptainSlotKey: null,
      selectedCaptainPlayerIdForSave: null,
      
      // Old panel state
      isPanelOpen: false,
      editingPosition: null,
      
      // New selection panel state
      isSelectionPanelOpen: false,
      selectedPosition: null,
      
      autoSaveStatus: 'idle',
      saveError: null,
      saveSuccess: null,
      autoSaveTimeoutId: null,
      
      // Real data initial state - old structure
      availableEntities: {} as Record<PositionKey, SelectableEntity[]>,
      entitiesLoading: {} as Record<PositionKey, boolean>,
      entitiesError: {} as Record<PositionKey, string | null>,
      
      // Real data initial state - new structure
      players: {} as Record<PositionKey, SelectablePlayer[]>,
      teams: {} as Record<PositionKey, SelectableTeam[]>,
      loadingStates: {} as Record<PositionKey, boolean>,
      errorStates: {} as Record<PositionKey, string | null>,
      
      usageCounts: {},
      weeklySchedule: null,
      
      // Context initial state
      currentWeek: null,
      currentSeason: null,
      userId: null,
      leagueId: null,
      
      // Lineup loading state
      isLoadingLineup: false,
      lineupUnsubscribe: null,
      
      // Basic actions with auto-save
      setLineup: (lineup) => {
        set({ lineup }, false, 'setLineup');
        get().autoSaveLineup(lineup);
      },
      
      updateLineupSlot: (positionKey, entity) => {
        const newLineup = {
          ...get().lineup,
          [positionKey]: entity
        };
        
        // Handle captain logic if clearing captain slot
        let captainId = get().selectedCaptainPlayerIdForSave;
        let captainSlotKey = get().designatedCaptainSlotKey;
        
        if (!entity && captainSlotKey === positionKey) {
          // Clearing the captain slot
          captainId = null;
          captainSlotKey = null;
        } else if (entity && entity.entityType === 'player' && captainSlotKey === positionKey) {
          // Setting a new player in the captain slot
          captainId = entity.id;
        } else if (!entity && captainId && get().lineup[positionKey]?.id === captainId) {
          // Clearing a slot that contains the current captain (but isn't the designated captain slot)
          captainId = null;
          captainSlotKey = null;
        }
        
        set({
          lineup: newLineup,
          designatedCaptainSlotKey: captainSlotKey,
          selectedCaptainPlayerIdForSave: captainId,
        }, false, 'updateLineupSlot');
        
        get().autoSaveLineup(newLineup, captainId);
      },
      
      clearLineup: () => {
        const emptyLineup = {};
        set({
          lineup: emptyLineup,
          designatedCaptainSlotKey: null,
          selectedCaptainPlayerIdForSave: null,
        }, false, 'clearLineup');
        get().autoSaveLineup(emptyLineup, null);
      },
      
      setCaptain: (slotKey, playerId) => {
        const state = get();
        
        console.log('setCaptain called:', { 
          slotKey, 
          playerId, 
          currentSlot: state.designatedCaptainSlotKey, 
          currentPlayerId: state.selectedCaptainPlayerIdForSave 
        });
        
        // Prevent redundant calls
        if (state.designatedCaptainSlotKey === slotKey && state.selectedCaptainPlayerIdForSave === playerId) {
          console.log('setCaptain: No change needed, skipping');
          return; // No change needed
        }
        
        // Validate the captain selection
        if (slotKey && playerId) {
          const entity = state.lineup[slotKey];
          if (!entity || entity.entityType !== 'player' || entity.id !== playerId) {
            console.warn('Invalid captain selection: slot does not contain the specified player');
            return;
          }
        }
        
        console.log('setCaptain: Updating store state');
        set({
          designatedCaptainSlotKey: slotKey,
          selectedCaptainPlayerIdForSave: playerId,
        }, false, 'setCaptain');
        get().autoSaveLineup(undefined, playerId);
      },
      
      // Old panel actions
      setPanel: (isOpen, editingPosition = null) => set({
        isPanelOpen: isOpen,
        editingPosition,
      }, false, 'setPanel'),
      
      // New selection panel actions
      openSelectionPanel: (position) => set({
        isSelectionPanelOpen: true,
        selectedPosition: position,
      }, false, 'openSelectionPanel'),
      
      closeSelectionPanel: () => set({
        isSelectionPanelOpen: false,
        selectedPosition: null,
      }, false, 'closeSelectionPanel'),
      
      setSaveStatus: (status, error = null, success = null) => set({
        autoSaveStatus: status,
        saveError: error,
        saveSuccess: success,
      }, false, 'setSaveStatus'),
      
      // Auto-save function with debouncing
      autoSaveLineup: async (lineup?: Partial<Record<PositionKey, SelectableEntity | undefined>>, captainId?: string | null) => {
        const state = get();
        const { userId, leagueId, currentWeek, autoSaveTimeoutId } = state;
        
        if (!userId || !leagueId || currentWeek === null) return;
        
        // Clear any existing timeout
        if (autoSaveTimeoutId) {
          clearTimeout(autoSaveTimeoutId);
        }
        
        // Set up debounced save (500ms delay)
        const timeoutId = setTimeout(async () => {
          try {
            set({ autoSaveStatus: 'saving', saveError: null }, false, 'autoSave:start');
            
            // Get fresh state to avoid stale closure issues
            const freshState = get();
            const currentLineup = lineup || freshState.lineup;
            const currentCaptainId = captainId !== undefined ? captainId : freshState.selectedCaptainPlayerIdForSave;
            
            const picksForBackend: Partial<Record<PositionKey, BackendLineupPick>> = {};
            for (const key in currentLineup) {
              if (Object.prototype.hasOwnProperty.call(currentLineup, key)) {
                const entity = currentLineup[key as PositionKey];
                if (entity) {
                  picksForBackend[key as PositionKey] = { id: entity.id, type: entity.entityType };
                }
              }
            }
            
            // Validate captain is actually in the lineup
            let validatedCaptainId = currentCaptainId;
            if (validatedCaptainId) {
              const captainExists = Object.values(currentLineup).some(
                entity => entity && entity.entityType === 'player' && entity.id === validatedCaptainId
              );
              if (!captainExists) {
                console.warn(`Captain ID ${validatedCaptainId} not found in current lineup, clearing captain`);
                validatedCaptainId = null;
                // Update the store to clear invalid captain
                set({
                  designatedCaptainSlotKey: null,
                  selectedCaptainPlayerIdForSave: null,
                }, false, 'autoSave:clearInvalidCaptain');
              }
            }
            
            const payload: SaveLineupPayload = {
              leagueId: freshState.leagueId!,
              week: freshState.currentWeek!,
              picks: picksForBackend,
              captainPlayerId: validatedCaptainId || null,
            };
            
            const result = await saveWeeklyLineupCallable(payload);
            const data = result.data as SaveLineupResult;
            
            if (data.success) {
              set({ 
                autoSaveStatus: 'saved', 
                saveError: null,
                saveSuccess: 'Lineup saved automatically'
              }, false, 'autoSave:success');
              
              // Update usage counts after successful save
              if (freshState.userId && freshState.leagueId) {
                const newUsageCounts = await fetchUsageCounts(freshState.userId, freshState.leagueId);
                set({ usageCounts: newUsageCounts }, false, 'autoSave:updateUsage');
              }
              
              // Clear saved status after 2 seconds
              setTimeout(() => {
                const currentState = get();
                if (currentState.autoSaveStatus === 'saved') {
                  set({ autoSaveStatus: 'idle', saveSuccess: null }, false, 'autoSave:clearStatus');
                }
              }, 2000);
            } else {
              set({ 
                autoSaveStatus: 'error', 
                saveError: data.message || "Failed to auto-save lineup.",
                saveSuccess: null
              }, false, 'autoSave:error');
            }
          } catch (error) {
            console.error("Error auto-saving lineup:", error);
            set({ 
              autoSaveStatus: 'error', 
              saveError: error instanceof Error ? error.message : "An unexpected error occurred while auto-saving.",
              saveSuccess: null
            }, false, 'autoSave:catch');
          }
        }, 500); // 500ms debounce
        
        set({ autoSaveTimeoutId: timeoutId }, false, 'autoSave:setTimeout');
      },
      
      // Real data actions
      initializeContext: async (userId, leagueId, week, season) => {
        // Clean up any existing listener
        const currentUnsubscribe = get().lineupUnsubscribe;
        if (currentUnsubscribe) {
          currentUnsubscribe();
        }
        
        set({
          userId,
          leagueId,
          currentWeek: week,
          currentSeason: season,
          isLoadingLineup: true,
          lineupUnsubscribe: null,
        }, false, 'initializeContext');
        
        try {
          // Fetch weekly schedule and usage counts in parallel
          const [schedule, usageCounts] = await Promise.all([
            fetchWeeklySchedule(season, week),
            fetchUsageCounts(userId, leagueId)
          ]);
          
          set({ 
            weeklySchedule: schedule,
            usageCounts: usageCounts
          }, false, 'initializeContext:setData');
          
          // Set up lineup listener
          const unsubscribe = listenToStoredWeeklyLineup(
            userId,
            leagueId,
            week,
            async (lineupData: StoredLineupData) => {
              await get().handleLineupData(lineupData, schedule);
            },
            (error: Error) => {
              console.error('Error listening to lineup data:', error);
              set({ 
                isLoadingLineup: false,
                saveError: 'Failed to load lineup data'
              }, false, 'lineupListener:error');
            }
          );
          
          set({ 
            lineupUnsubscribe: unsubscribe || null 
          }, false, 'initializeContext:setListener');
          
        } catch (error) {
          console.error('Error initializing context:', error);
          set({ 
            isLoadingLineup: false,
            saveError: 'Failed to initialize lineup context'
          }, false, 'initializeContext:error');
        }
      },
      
      fetchSelectablePlayers: async (positionKey) => {
        const state = get();
        
        set((state) => ({
          loadingStates: { ...state.loadingStates, [positionKey]: true },
          errorStates: { ...state.errorStates, [positionKey]: null }
        }), false, 'fetchSelectablePlayers:start');
        
        try {
          const players = await fetchSelectablePlayers(positionKey, state.usageCounts, state.weeklySchedule);
          
          set((state) => ({
            players: { ...state.players, [positionKey]: players },
            loadingStates: { ...state.loadingStates, [positionKey]: false }
          }), false, 'fetchSelectablePlayers:success');
        } catch (error) {
          console.error(`Error fetching players for ${positionKey}:`, error);
          set((state) => ({
            loadingStates: { ...state.loadingStates, [positionKey]: false },
            errorStates: { ...state.errorStates, [positionKey]: error instanceof Error ? error.message : 'Failed to load players' }
          }), false, 'fetchSelectablePlayers:error');
        }
      },
      
      fetchSelectableTeams: async (positionKey) => {
        const state = get();
        
        set((state) => ({
          loadingStates: { ...state.loadingStates, [positionKey]: true },
          errorStates: { ...state.errorStates, [positionKey]: null }
        }), false, 'fetchSelectableTeams:start');
        
        try {
          const teams = await fetchSelectableTeams(positionKey, state.usageCounts, state.weeklySchedule);
          
          set((state) => ({
            teams: { ...state.teams, [positionKey]: teams },
            loadingStates: { ...state.loadingStates, [positionKey]: false }
          }), false, 'fetchSelectableTeams:success');
        } catch (error) {
          console.error(`Error fetching teams for ${positionKey}:`, error);
          set((state) => ({
            loadingStates: { ...state.loadingStates, [positionKey]: false },
            errorStates: { ...state.errorStates, [positionKey]: error instanceof Error ? error.message : 'Failed to load teams' }
          }), false, 'fetchSelectableTeams:error');
        }
      },
      
      // Lineup data handling
      handleLineupData: async (lineupData: StoredLineupData, schedule?: FirestoreWeeklySchedule | null) => {
        try {
          const state = get();
          const { usageCounts } = state;
          
          console.log('handleLineupData called with:', {
            captainPlayerId: lineupData.captainPlayerId,
            currentCaptainSlot: state.designatedCaptainSlotKey,
            currentCaptainPlayerId: state.selectedCaptainPlayerIdForSave
          });
          
          if (!lineupData.picks) {
            // No lineup saved yet
            console.log('handleLineupData: No picks found, clearing lineup');
            set({ 
              lineup: {},
              designatedCaptainSlotKey: null,
              selectedCaptainPlayerIdForSave: null,
              isLoadingLineup: false 
            }, false, 'handleLineupData:empty');
            return;
          }
          
          // Reconstruct lineup from stored picks
          const reconstructedLineup: Partial<Record<PositionKey, SelectableEntity | undefined>> = {};
          
          for (const [posKey, pick] of Object.entries(lineupData.picks)) {
            if (pick) {
              try {
                let entity: SelectableEntity | null = null;
                
                if (pick.type === 'player') {
                  entity = await fetchSelectablePlayerById(pick.id, usageCounts || undefined, schedule);
                } else if (pick.type === 'team') {
                  entity = await fetchSelectableTeamById(pick.id, posKey as PositionKey, usageCounts || undefined, schedule);
                }
                
                if (entity) {
                  reconstructedLineup[posKey as PositionKey] = entity;
                }
              } catch (error) {
                console.warn(`Failed to load entity ${pick.id} for position ${posKey}:`, error);
              }
            }
          }
          
          // Find captain slot if captain is set
          let captainSlotKey: PositionKey | null = null;
          if (lineupData.captainPlayerId) {
            for (const [posKey, entity] of Object.entries(reconstructedLineup)) {
              if (entity && entity.entityType === 'player' && entity.id === lineupData.captainPlayerId) {
                captainSlotKey = posKey as PositionKey;
                break;
              }
            }
          }
          
          console.log('handleLineupData: Setting captain to:', {
            captainSlotKey,
            captainPlayerId: lineupData.captainPlayerId
          });
          
          // Check if captain data has actually changed to prevent unnecessary updates
          const currentCaptainSlot = state.designatedCaptainSlotKey;
          const currentCaptainPlayerId = state.selectedCaptainPlayerIdForSave;
          const newCaptainPlayerId = lineupData.captainPlayerId || null;
          
          const captainHasChanged = currentCaptainSlot !== captainSlotKey || currentCaptainPlayerId !== newCaptainPlayerId;
          
          if (!captainHasChanged) {
            console.log('handleLineupData: Captain data unchanged, skipping captain update');
            // Only update lineup, not captain state
            set({
              lineup: reconstructedLineup,
              isLoadingLineup: false,
            }, false, 'handleLineupData:lineupOnly');
          } else {
            console.log('handleLineupData: Captain data changed, updating all state');
            set({
              lineup: reconstructedLineup,
              designatedCaptainSlotKey: captainSlotKey,
              selectedCaptainPlayerIdForSave: newCaptainPlayerId,
              isLoadingLineup: false,
            }, false, 'handleLineupData:success');
          }
          
        } catch (error) {
          console.error('Error handling lineup data:', error);
          set({ 
            isLoadingLineup: false,
            saveError: 'Failed to load lineup'
          }, false, 'handleLineupData:error');
        }
      },
      
      // Cleanup action
      cleanup: () => {
        const state = get();
        
        // Clean up lineup listener
        if (state.lineupUnsubscribe) {
          state.lineupUnsubscribe();
        }
        
        // Clear auto-save timeout
        if (state.autoSaveTimeoutId) {
          clearTimeout(state.autoSaveTimeoutId);
        }
        
        // Reset state
        set({
          lineupUnsubscribe: null,
          autoSaveTimeoutId: null,
          isLoadingLineup: false,
        }, false, 'cleanup');
      },
    }),
    {
      name: 'lineup-store',
    }
  )
); 