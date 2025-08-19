import React, { useState, useEffect } from 'react';
import { League } from '../../../utils/leagues';
import Button from '../../ui/button/Button';
import Input from '../../form/input/InputField';
import Switch from '../../form/switch/Switch';
import Label from '../../form/Label';
import toast from 'react-hot-toast';
import {
  renameLeague,
  toggleLeagueVisibility,
  updateLeagueCaptainSettings,
  updateLeagueWeeklyTipsSettings,
  updateLeagueAutoSettings
} from '../../../utils/leagues';

interface SettingsTabProps {
  league: League;
  currentEnableCaptain: boolean;
  setCurrentEnableCaptain: (value: boolean) => void;
  currentCaptainMultiplier: number;
  setCurrentCaptainMultiplier: (value: number) => void;
  currentEnableWeeklyTips: boolean;
  setCurrentEnableWeeklyTips: (value: boolean) => void;
  currentAutoLineupEnabled: boolean;
  setCurrentAutoLineupEnabled: (value: boolean) => void;
  currentAutoTipsEnabled: boolean;
  setCurrentAutoTipsEnabled: (value: boolean) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (value: boolean) => void;
  savingChanges: boolean;
  setSavingChanges: (value: boolean) => void;
  autoSaveInProgress: string | null;
  setAutoSaveInProgress: (value: string | null) => void;
}

export default function SettingsTab({
  league,
  currentEnableCaptain,
  setCurrentEnableCaptain,
  currentCaptainMultiplier,
  setCurrentCaptainMultiplier,
  currentEnableWeeklyTips,
  setCurrentEnableWeeklyTips,
  currentAutoLineupEnabled,
  setCurrentAutoLineupEnabled,
  currentAutoTipsEnabled,
  setCurrentAutoTipsEnabled,
  hasUnsavedChanges,
  setHasUnsavedChanges,
  savingChanges,
  setSavingChanges,
  autoSaveInProgress,
  setAutoSaveInProgress
}: SettingsTabProps) {
  
  // Inline edit state for league name
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(league.name);
  const [savingName, setSavingName] = useState(false);

  // Sync edited name when league changes
  useEffect(() => {
    setEditedName(league.name);
  }, [league.name]);
  
  // Auto-save utility function for simple settings
  const autoSaveSetting = async (settingName: string, updateFunction: () => Promise<unknown>) => {
    if (!league) return;
    
    setAutoSaveInProgress(settingName);
    try {
      await updateFunction();
      toast.success(`${settingName} updated!`);
    } catch (err) {
      toast.error(`Failed to update ${settingName}`);
      console.error(`Error updating ${settingName}:`, err);
    } finally {
      setAutoSaveInProgress(null);
    }
  };

  /** Handle inline name edit */
  const handleNameSave = async () => {
    if (!league || !editedName.trim() || editedName.trim() === league.name) {
      setIsEditingName(false);
      setEditedName(league.name);
      return;
    }
    
    setSavingName(true);
    try {
      await renameLeague(league.id, editedName.trim());
      toast.success("League renamed");
      setIsEditingName(false);
    } catch {
      toast.error("Rename failed");
      setEditedName(league.name);
    } finally {
      setSavingName(false);
    }
  };

  const handleNameCancel = () => {
    setIsEditingName(false);
    setEditedName(league.name);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  /** toggle privacy with auto-save */
  async function handleTogglePrivacy(checked: boolean) {
    if (!league) return;
    await autoSaveSetting(
      checked ? "League made public" : "League made private",
      () => toggleLeagueVisibility(league.id, checked)
    );
  }

  /** Handle captain toggle - tracks changes for multiplier validation */
  function handleCaptainToggle(checked: boolean) {
    setCurrentEnableCaptain(checked);
    if (!checked) {
      // If disabling captain, we can save immediately
      setHasUnsavedChanges(false);
    } else {
      // If enabling captain, mark as having unsaved changes (multiplier might need adjustment)
      setHasUnsavedChanges(true);
    }
  }

  /** Handle captain multiplier changes */
  function handleCaptainMultiplierChange(value: number) {
    setCurrentCaptainMultiplier(value);
    setHasUnsavedChanges(true);
  }

  /** Save captain settings (unified save for complex validation) */
  async function handleSaveCaptainSettings() {
    if (!league) return;
    if (currentEnableCaptain && (currentCaptainMultiplier < 1 || currentCaptainMultiplier > 3)) {
        toast.error("Captain point multiplier must be between 1 and 3.");
        return;
    }
    
    setSavingChanges(true);
    try {
      await updateLeagueCaptainSettings({
        leagueId: league.id,
        enableCaptainFeature: currentEnableCaptain,
        captainPointMultiplier: currentCaptainMultiplier,
      });
      toast.success("Captain settings updated!");
      setHasUnsavedChanges(false);
    } catch (err) {
      toast.error("Failed to update captain settings.");
      console.error("Error updating captain settings:", err);
    } finally {
      setSavingChanges(false);
    }
  }

  /** Auto-save weekly tips toggle */
  async function handleWeeklyTipsToggle(checked: boolean) {
    setCurrentEnableWeeklyTips(checked);
    await autoSaveSetting(
      checked ? "Weekly tips enabled" : "Weekly tips disabled",
      () => updateLeagueWeeklyTipsSettings({
        leagueId: league.id,
        enableWeeklyTips: checked,
      })
    );
  }

  /** Auto-save auto-lineup toggle */
  async function handleAutoLineupToggle(checked: boolean) {
    setCurrentAutoLineupEnabled(checked);
    await autoSaveSetting(
      checked ? "Auto-lineup enabled" : "Auto-lineup disabled",
      () => updateLeagueAutoSettings({
        leagueId: league.id,
        autoLineup: { enabled: checked },
        autoTips: { enabled: currentAutoTipsEnabled }, // Keep current tips setting
      })
    );
  }

  /** Auto-save auto-tips toggle */
  async function handleAutoTipsToggle(checked: boolean) {
    setCurrentAutoTipsEnabled(checked);
    await autoSaveSetting(
      checked ? "Auto-tips enabled" : "Auto-tips disabled",
      () => updateLeagueAutoSettings({
        leagueId: league.id,
        autoLineup: { enabled: currentAutoLineupEnabled }, // Keep current lineup setting
        autoTips: { enabled: checked },
      })
    );
  }



  const memberCount = league.members?.length ?? 0;
  const isPublic = league.isPublic ?? false;

  return (
    <div className="space-y-6">
      {/* League Information */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">League Information</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">League Name</span>
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <>
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    className="w-48 h-8 text-sm"
                    autoFocus
                    disabled={savingName}
                  />
                  <button
                    onClick={handleNameSave}
                    disabled={savingName || !editedName.trim() || editedName.trim() === league.name}
                    className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 p-1 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
                    title="Save"
                  >
                    {savingName ? (
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={handleNameCancel}
                    disabled={savingName}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                    title="Cancel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <span className="font-medium text-gray-900 dark:text-white">{league.name}</span>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    title="Edit League Name"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">League ID</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                {league.id}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(league.id);
                  toast.success("League ID copied to clipboard!");
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Copy League ID"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Join Code</span>
            <span className="font-mono font-medium text-gray-900 dark:text-white">{league.code}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Visibility</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                {(autoSaveInProgress === "League made public" || autoSaveInProgress === "League made private") && (
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                )}
              </div>
              <Switch 
                labelPosition="left"
                label={isPublic ? 'Public' : 'Private'}
                checked={league.isPublic ?? false}
                onChange={handleTogglePrivacy}
                disabled={autoSaveInProgress === "League made public" || autoSaveInProgress === "League made private"}
              />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Total Members</span>
            <span className="font-medium text-gray-900 dark:text-white">{memberCount}</span>
          </div>
        </div>
      </div>

      {/* League Features */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">League Features</h3>
        <div className="space-y-4">
          
          {/* Captain Feature */}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">Captain Feature</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Allow players to select a captain for bonus points</div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                labelPosition="left"
                label=""
                checked={currentEnableCaptain}
                onChange={handleCaptainToggle}
              />
            </div>
          </div>

          {/* Captain Multiplier (conditional) */}
          {currentEnableCaptain && (
            <div className="flex items-center justify-between py-2 pl-6 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
              <div className="flex items-center gap-4">
                <div>
                  <Label htmlFor="feature-multiplier" className="text-sm font-medium">Captain Point Multiplier</Label>
                </div>
                <Input
                  id="feature-multiplier"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="3"
                  step="0.1"
                  value={currentCaptainMultiplier}
                  onChange={(e) => handleCaptainMultiplierChange(parseFloat(e.target.value))}
                  className="w-20 h-8"
                />
                {hasUnsavedChanges && (
                  <Button 
                    onClick={handleSaveCaptainSettings} 
                    size="sm" 
                    variant="primary"
                    disabled={savingChanges}
                    className="h-8"
                  >
                    {savingChanges ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
              {hasUnsavedChanges && (
                <span className="text-xs text-amber-600 dark:text-amber-400 mr-4">
                  • Unsaved changes
                </span>
              )}
            </div>
          )}

          {/* Weekly Tips */}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">Weekly Tips</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Allow members to make game predictions</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                labelPosition="left"
                label=""
                checked={currentEnableWeeklyTips}
                onChange={handleWeeklyTipsToggle}
                disabled={autoSaveInProgress === "Weekly tips enabled" || autoSaveInProgress === "Weekly tips disabled"}
              />
              {(autoSaveInProgress === "Weekly tips enabled" || autoSaveInProgress === "Weekly tips disabled") && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>

          {/* Auto-Lineup */}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">🤖 Auto-Lineup</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Uses Quick Pick logic, 1 hour before games start</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                labelPosition="left"
                label=""
                checked={currentAutoLineupEnabled}
                onChange={handleAutoLineupToggle}
                disabled={autoSaveInProgress === "Auto-lineup enabled" || autoSaveInProgress === "Auto-lineup disabled"}
              />
              {(autoSaveInProgress === "Auto-lineup enabled" || autoSaveInProgress === "Auto-lineup disabled") && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>

          {/* Auto-Tips */}
          <div className="flex items-center justify-between py-3">
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">🎯 Auto-Tips</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Follows betting favorites, 1 hour before games start</div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                labelPosition="left"
                label=""
                checked={currentAutoTipsEnabled}
                onChange={handleAutoTipsToggle}
                disabled={autoSaveInProgress === "Auto-tips enabled" || autoSaveInProgress === "Auto-tips disabled"}
              />
              {(autoSaveInProgress === "Auto-tips enabled" || autoSaveInProgress === "Auto-tips disabled") && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

