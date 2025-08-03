import React, { useState } from 'react';
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
  
  // Auto-save utility function for simple settings
  const autoSaveSetting = async (settingName: string, updateFunction: Function) => {
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

  /** rename will optimistically update local state */
  async function handleRename(newName: string) {
    if (!league) return;
    try {
      await renameLeague(league.id, newName.trim());
      toast.success("League renamed");
    } catch {
      toast.error("Rename failed");
    }
  }

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

  // Feature status
  const features = [
    {
      name: 'Captain Feature',
      enabled: league.enableCaptainFeature ?? false,
      description: `Point multiplier: ${league.captainPointMultiplier ?? 1.5}x`
    },
    {
      name: 'Weekly Tips',
      enabled: league.enableWeeklyTips ?? false,
      description: 'Game predictions and leaderboard'
    },
    {
      name: 'Auto-Lineup',
      enabled: league.autoLineup?.enabled ?? false,
      description: 'Automatic lineup generation'
    },
    {
      name: 'Auto-Tips',
      enabled: league.autoTips?.enabled ?? false,
      description: 'Automatic game predictions'
    }
  ];

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
            <span className="font-medium text-gray-900 dark:text-white">{league.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Join Code</span>
            <span className="font-mono font-medium text-gray-900 dark:text-white">{league.code}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-400">Visibility</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {isPublic ? 'Public' : 'Private'}
            </span>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {features.map((feature) => (
            <div key={feature.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">{feature.name}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{feature.description}</div>
              </div>
              <div className={`w-3 h-3 rounded-full ${feature.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
            </div>
          ))}
        </div>
      </div>

      {/* League Name Section */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">League Name</h3>
        <RenameForm current={league.name} onSave={handleRename} />
      </div>

      {/* Privacy Settings */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Privacy Settings</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">Public League</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Allow others to find and join this league</p>
          </div>
          <Switch
            label=""
            defaultChecked={league.isPublic ?? false}
            onChange={handleTogglePrivacy}
            disabled={autoSaveInProgress === "League made public" || autoSaveInProgress === "League made private"}
          />
        </div>
      </div>

      {/* Captain Settings */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Captain Feature</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Enable Captain</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Allow players to select a captain for bonus points</p>
            </div>
            <Switch
              label=""
              defaultChecked={currentEnableCaptain}
              onChange={handleCaptainToggle}
            />
          </div>
          
          {currentEnableCaptain && (
            <div className="space-y-3 pt-4 border-t border-gray-200 dark:border-gray-600">
              <div>
                <Label htmlFor="multiplier">Captain Point Multiplier</Label>
                <Input
                  id="multiplier"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="3"
                  step="0.1"
                  value={currentCaptainMultiplier}
                  onChange={(e) => handleCaptainMultiplierChange(parseFloat(e.target.value))}
                  className="mt-1"
                />
              </div>
              
              {hasUnsavedChanges && (
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleSaveCaptainSettings} 
                    size="sm" 
                    variant="primary"
                    disabled={savingChanges}
                  >
                    {savingChanges ? "Saving..." : "Save Changes"}
                  </Button>
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    • Unsaved changes
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Weekly Tips Settings */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Weekly Tips</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">Enable Weekly Tips</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Allow members to make game predictions</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              label=""
              defaultChecked={currentEnableWeeklyTips}
              onChange={handleWeeklyTipsToggle}
              disabled={autoSaveInProgress === "Weekly tips enabled" || autoSaveInProgress === "Weekly tips disabled"}
            />
            {(autoSaveInProgress === "Weekly tips enabled" || autoSaveInProgress === "Weekly tips disabled") && (
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
        </div>
      </div>

      {/* Auto-Assistant Settings */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Auto-Assistant</h3>
        <div className="space-y-4">
          
          {/* Auto-Lineup */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">🤖 Auto-Lineup</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Uses Quick Pick logic, 1 hour before games start</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                label=""
                defaultChecked={currentAutoLineupEnabled}
                onChange={handleAutoLineupToggle}
                disabled={autoSaveInProgress === "Auto-lineup enabled" || autoSaveInProgress === "Auto-lineup disabled"}
              />
              {(autoSaveInProgress === "Auto-lineup enabled" || autoSaveInProgress === "Auto-lineup disabled") && (
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          </div>

          {/* Auto-Tips */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">🎯 Auto-Tips</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Follows betting favorites, 1 hour before games start</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                label=""
                defaultChecked={currentAutoTipsEnabled}
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

// Rename Form Component
function RenameForm({
  current,
  onSave,
}: {
  current: string;
  onSave: (newName: string) => Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === current) return;
    
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1"
        placeholder="League name"
      />
      <Button
        type="submit"
        size="sm"
        disabled={saving || !name.trim() || name.trim() === current}
      >
        {saving ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}