import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { initMessaging } from '../../firebase/firebase';
import ComponentCard from '../common/ComponentCard';
import Button from '../ui/button/Button';
import Switch from '../form/switch/Switch';
import type { NotificationPreferences as NotificationPrefs } from '../../types/notifications';

const defaultPreferences: NotificationPrefs = {
  enabled: true,
  lineupDeadlineAlerts: true,
  lineupDeadlineMinutes: 180, // Default to 3 hours, but 24 hours is available
  scoringAlerts: true,
  captainSuccessAlerts: true,
  injuryAlerts: true,
  achievementAlerts: true,
  autoLineupAlerts: true,
  autoTipsAlerts: true,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  }
};

export const NotificationPreferencesComponent: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);
  const [localPrefs, setLocalPrefs] = useState<NotificationPrefs>(defaultPreferences);

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['userPreferences', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      const userDoc = await getDoc(doc(db, 'users', user!.uid));
      const userData = userDoc.data();
      const prefs = userData?.notificationPreferences || defaultPreferences;
      setLocalPrefs(prefs);
      return prefs as NotificationPrefs;
    },
  });

  const updatePreferences = useMutation({
    mutationFn: async (newPrefs: NotificationPrefs) => {
      if (!user?.uid) return;
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        notificationPreferences: newPrefs
      });
      return newPrefs;
    },
    onSuccess: (newPrefs) => {
      qc.setQueryData(['userPreferences', user?.uid], newPrefs);
      setHasChanges(false);
    }
  });

  const handleChange = async (key: keyof NotificationPrefs, value: any) => {
    const updated = { ...localPrefs, [key]: value };
    setLocalPrefs(updated);
    setHasChanges(true);
    
    // If enabling notifications for the first time, request permission and initialize FCM token
    if (key === 'enabled' && value === true) {
      try {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            // Initialize FCM token
            await initMessaging(user?.uid || null);
            if (import.meta.env.DEV) console.log('FCM token initialized successfully');
          }
        }
      } catch (error) {
        console.error('Failed to initialize FCM token:', error);
      }
    }
  };

  const handleQuietHoursChange = (key: keyof NotificationPrefs['quietHours'], value: any) => {
    const updated = {
      ...localPrefs,
      quietHours: { ...localPrefs.quietHours, [key]: value }
    };
    setLocalPrefs(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    updatePreferences.mutate(localPrefs);
  };

  const handleReset = () => {
    if (preferences) {
      setLocalPrefs(preferences);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <ComponentCard title="Notification Preferences">
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading preferences...
        </div>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title="Notification Preferences">
      <div className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900 dark:text-white">Enable Notifications</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Turn all notifications on or off</p>
          </div>
          <Switch
            label=""
            defaultChecked={localPrefs.enabled}
            onChange={(checked: boolean) => handleChange('enabled', checked)}
          />
        </div>

        {localPrefs.enabled && (
          <>
            {/* Lineup Management */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">Lineup Management</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Lineup Deadline Alerts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get notified before lineup deadlines</p>
                  </div>
                  <Switch
                    label=""
            defaultChecked={localPrefs.lineupDeadlineAlerts}
                    onChange={(checked: boolean) => handleChange('lineupDeadlineAlerts', checked)}
                  />
                </div>

                {localPrefs.lineupDeadlineAlerts && (
                  <div className="ml-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Alert me this many minutes before deadline:
                    </label>
                    <select 
                      value={localPrefs.lineupDeadlineMinutes}
                      onChange={(e) => handleChange('lineupDeadlineMinutes', parseInt(e.target.value))}
                      className="border rounded-md p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={180}>3 hours</option>
                      <option value={360}>6 hours</option>
                      <option value={720}>12 hours</option>
                      <option value={1440}>1 day (24 hours)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Performance Alerts */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">Performance & Scoring</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Scoring Alerts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get notified about your scoring performance</p>
                  </div>
                  <Switch
                    label=""
            defaultChecked={localPrefs.scoringAlerts}
                    onChange={(checked: boolean) => handleChange('scoringAlerts', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Captain Success Alerts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get notified when your captain performs well</p>
                  </div>
                  <Switch
                    label=""
            defaultChecked={localPrefs.captainSuccessAlerts}
                    onChange={(checked: boolean) => handleChange('captainSuccessAlerts', checked)}
                  />
                </div>
              </div>
            </div>

            {/* Player Management */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">Player Management</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Injury Alerts</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get notified about player injuries</p>
                </div>
                <Switch
                  label=""
            defaultChecked={localPrefs.injuryAlerts}
                  onChange={(checked: boolean) => handleChange('injuryAlerts', checked)}
                />
              </div>
            </div>

            {/* Achievements */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">Achievements</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Achievement Alerts</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get notified when you unlock achievements</p>
                </div>
                <Switch
                  label=""
            defaultChecked={localPrefs.achievementAlerts}
                  onChange={(checked: boolean) => handleChange('achievementAlerts', checked)}
                />
              </div>
            </div>

            {/* Auto-Assistant */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">Auto-Assistant</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Auto-Lineup Alerts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get notified when auto-lineup is applied</p>
                  </div>
                  <Switch
                    label=""
            defaultChecked={localPrefs.autoLineupAlerts}
                    onChange={(checked: boolean) => handleChange('autoLineupAlerts', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Auto-Tips Alerts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get notified when auto-tips are applied</p>
                  </div>
                  <Switch
                    label=""
            defaultChecked={localPrefs.autoTipsAlerts}
                    onChange={(checked: boolean) => handleChange('autoTipsAlerts', checked)}
                  />
                </div>
              </div>
            </div>

            {/* Quiet Hours */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-4">Quiet Hours</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Enable Quiet Hours</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Don't send notifications during these hours</p>
                  </div>
                  <Switch
                    label=""
            defaultChecked={localPrefs.quietHours.enabled}
                    onChange={(checked: boolean) => handleQuietHoursChange('enabled', checked)}
                  />
                </div>

                {localPrefs.quietHours.enabled && (
                  <div className="ml-4 flex items-center gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Start time
                      </label>
                      <input
                        type="time"
                        value={localPrefs.quietHours.start}
                        onChange={(e) => handleQuietHoursChange('start', e.target.value)}
                        className="border rounded-md p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End time
                      </label>
                      <input
                        type="time"
                        value={localPrefs.quietHours.end}
                        onChange={(e) => handleQuietHoursChange('end', e.target.value)}
                        className="border rounded-md p-2 text-sm dark:bg-gray-800 dark:border-gray-700"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        {hasChanges && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6 flex gap-3">
            <Button 
              onClick={handleSave}
              disabled={updatePreferences.isPending}
            >
              {updatePreferences.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button 
              variant="outline" 
              onClick={handleReset}
              disabled={updatePreferences.isPending}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </ComponentCard>
  );
};

export default NotificationPreferencesComponent;
