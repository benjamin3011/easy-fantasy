import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import Switch from '../form/switch/Switch';
import Button from '../ui/button/Button';
import ComponentCard from './ComponentCard';
import Spinner from '../ui/Spinner';

interface NotificationPreferences {
  lineupDeadlineAlerts: boolean;
  lineupDeadlineMinutes: number;
  scoringAlerts: boolean;
  injuryAlerts: boolean;
  leagueActivityAlerts: boolean;
  enabled: boolean;
}

const defaultPreferences: NotificationPreferences = {
  lineupDeadlineAlerts: true,
  lineupDeadlineMinutes: 30,
  scoringAlerts: false, // Will implement later
  injuryAlerts: false, // Will implement later
  leagueActivityAlerts: false, // Will implement later
  enabled: true,
};

export default function NotificationSettings() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Check notification permission status
  useEffect(() => {
    if ('Notification' in window) {
      setHasPermission(Notification.permission === 'granted');
    } else {
      setHasPermission(false);
    }
  }, []);

  // Load user's current notification preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!user?.uid) return;

      try {
        setIsLoading(true);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const userPrefs = userData.notificationPreferences;
          
          if (userPrefs) {
            setPreferences({ ...defaultPreferences, ...userPrefs });
          }
        }
      } catch (err) {
        console.error('Error loading notification preferences:', err);
        setError('Failed to load notification settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, [user?.uid]);

  // Request notification permission
  const requestPermission = async () => {
    if (!('Notification' in window)) {
      setError('Notifications are not supported in this browser');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setHasPermission(permission === 'granted');
      
      if (permission === 'granted') {
        setSuccess('Notification permission granted!');
        // Initialize messaging to get FCM token
        const { initMessaging } = await import('../../firebase/firebase');
        await initMessaging(user?.uid || null);
      } else {
        setError('Notification permission denied');
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
      setError('Failed to request notification permission');
    }
  };

  // Save notification preferences
  const savePreferences = async () => {
    if (!user?.uid) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const updateNotificationPreferences = httpsCallable(functions, 'updateNotificationPreferences');
      await updateNotificationPreferences(preferences);

      setSuccess('Notification settings saved successfully!');
    } catch (err) {
      console.error('Error saving notification preferences:', err);
      setError('Failed to save notification settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle preference changes
  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean | number) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  if (isLoading) {
    return (
      <ComponentCard title="Notification Settings">
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title="Notification Settings">
      <div className="space-y-6">
        {/* Permission Status */}
        {hasPermission === false && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Notifications Disabled
                </h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                  Enable browser notifications to receive lineup reminders and alerts.
                </p>
              </div>
              <Button
                onClick={requestPermission}
                size="sm"
                variant="primary"
              >
                Enable
              </Button>
            </div>
          </div>
        )}

        {hasPermission === true && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h4 className="text-sm font-medium text-green-800 dark:text-green-200">
                  Notifications Enabled
                </h4>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  You'll receive notifications based on your preferences below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Master Toggle */}
        <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
          <Switch
            label="Enable All Notifications"
            defaultChecked={preferences.enabled}
            onChange={(checked) => handlePreferenceChange('enabled', checked)}
            disabled={hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Master switch for all notification types
          </p>
        </div>

        {/* Lineup Deadline Alerts */}
        <div className="space-y-3">
          <Switch
            label="Lineup Deadline Alerts"
            defaultChecked={preferences.lineupDeadlineAlerts}
            onChange={(checked) => handlePreferenceChange('lineupDeadlineAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified when games are starting soon and you have incomplete lineups
          </p>
          
          {preferences.lineupDeadlineAlerts && (
            <div className="ml-6 space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Alert me when games start in:
              </label>
              <select
                value={preferences.lineupDeadlineMinutes}
                onChange={(e) => handlePreferenceChange('lineupDeadlineMinutes', parseInt(e.target.value))}
                className="block w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                disabled={!preferences.enabled || hasPermission !== true}
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          )}
        </div>

        {/* Future notification types (disabled for now) */}
        <div className="space-y-4 opacity-50">
          <Switch
            label="Scoring Alerts"
            defaultChecked={preferences.scoringAlerts}
            onChange={(checked) => handlePreferenceChange('scoringAlerts', checked)}
            disabled={true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified when your players score (Coming Soon)
          </p>

          <Switch
            label="Injury Alerts"
            defaultChecked={preferences.injuryAlerts}
            onChange={(checked) => handlePreferenceChange('injuryAlerts', checked)}
            disabled={true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified about injury updates for your players (Coming Soon)
          </p>

          <Switch
            label="League Activity"
            defaultChecked={preferences.leagueActivityAlerts}
            onChange={(checked) => handlePreferenceChange('leagueActivityAlerts', checked)}
            disabled={true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified about league standings and activity (Coming Soon)
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={savePreferences}
            disabled={isSaving || hasPermission !== true}
            className="min-w-24"
          >
            {isSaving ? <Spinner size="sm" /> : 'Save Settings'}
          </Button>
        </div>
      </div>
    </ComponentCard>
  );
} 