import { createContext, useContext, ReactNode } from 'react';
import { PositionKey } from '../types/lineup';

interface LineupPointsContextType {
  hasGameStarted: boolean;
  actualPoints: Record<string, number>;
  isLoading: boolean;
  captainSlotKey: PositionKey | null;
  captainMultiplier: number;
}

const LineupPointsContext = createContext<LineupPointsContextType | undefined>(undefined);

interface LineupPointsProviderProps {
  children: ReactNode;
  hasGameStarted: boolean;
  actualPoints: Record<string, number>;
  isLoading: boolean;
  captainSlotKey: PositionKey | null;
  captainMultiplier: number;
}

export function LineupPointsProvider({ 
  children, 
  hasGameStarted, 
  actualPoints, 
  isLoading,
  captainSlotKey,
  captainMultiplier
}: LineupPointsProviderProps) {
  return (
    <LineupPointsContext.Provider value={{ 
      hasGameStarted, 
      actualPoints, 
      isLoading, 
      captainSlotKey, 
      captainMultiplier 
    }}>
      {children}
    </LineupPointsContext.Provider>
  );
}

export function useLineupPoints() {
  const context = useContext(LineupPointsContext);
  if (context === undefined) {
    throw new Error('useLineupPoints must be used within a LineupPointsProvider');
  }
  return context;
}
