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
  // Lineup Management
  lineupDeadlineAlerts: boolean;
  lineupDeadlineMinutes: number;
  
  // Personal Performance  
  scoringAlerts: boolean;
  captainSuccessAlerts: boolean;
  
  // Player Management
  injuryAlerts: boolean;
  
  // Personal Achievements
  achievementAlerts: boolean;
  
  // Auto-Assistant Features
  autoLineupAlerts: boolean;
  autoTipsAlerts: boolean;
  
  // System
  enabled: boolean;
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
  };
}

const defaultPreferences: NotificationPreferences = {
  // Lineup Management
  lineupDeadlineAlerts: true,
  lineupDeadlineMinutes: 30,
  
  // Personal Performance
  scoringAlerts: false, // Will implement in this phase
  captainSuccessAlerts: false, // Will implement in this phase
  
  // Player Management
  injuryAlerts: false, // Will implement in this phase
  
  // Personal Achievements
  achievementAlerts: false, // Will implement in this phase
  
  // Auto-Assistant Features
  autoLineupAlerts: true, // Enabled by default
  autoTipsAlerts: true,   // Enabled by default
  
  // System
  enabled: true,
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00"
  }
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
        // Detect iOS PWA (Safari Add-to-Home-Screen) and use Web Push subscription
        const navAny = window.navigator as unknown as { standalone?: boolean };
        const isStandalone = (typeof navAny.standalone === 'boolean' && navAny.standalone === true)
          || window.matchMedia('(display-mode: standalone)').matches;
        const ua = window.navigator.userAgent || '';
        const isIOS = /iP(hone|od|ad)/.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        const isIosPwa = isIOS && isSafari && isStandalone;

        if (isIosPwa && 'serviceWorker' in navigator && 'PushManager' in window) {
          try {
            const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY as string | undefined;
            if (!publicKey) {
              setError('Web Push public key is not configured');
              return;
            }
            const registration = await navigator.serviceWorker.ready;
            const urlBase64ToUint8Array = (base64String: string) => {
              const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
              const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
              const rawData = atob(base64);
              const outputArray = new Uint8Array(rawData.length);
              for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
              return outputArray;
            };
            const rawSubscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            const saveWebPushSubscription = httpsCallable(functions, 'saveWebPushSubscription');
            // Persist only the portable JSON shape (endpoint + keys)
            const json = (rawSubscription as unknown as { toJSON?: () => unknown })?.toJSON?.() || rawSubscription;
            await saveWebPushSubscription({ subscription: json });
          } catch (subErr) {
            console.error('Web Push subscription failed:', subErr);
            setError('Failed to subscribe to Web Push');
          }
        } else {
          // Initialize FCM to get token for Android/desktop web
          // Use static import to avoid mixed dynamic/static chunking warnings
          const { initMessaging } = await import('../../firebase/firebase');
          await initMessaging(user?.uid || null);
        }
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
  const handlePreferenceChange = (key: keyof NotificationPreferences, value: boolean | number | { enabled: boolean; start: string; end: string; }) => {
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

        {/* Personal Performance Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Personal Performance</h4>
          
          <Switch
            label="Scoring Alerts"
            defaultChecked={preferences.scoringAlerts}
            onChange={(checked) => handlePreferenceChange('scoringAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified when your players score fantasy points 🏈
          </p>

          <Switch
            label="Captain Success Alerts"
            defaultChecked={preferences.captainSuccessAlerts}
            onChange={(checked) => handlePreferenceChange('captainSuccessAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified when your captain pick pays off 🔥
          </p>
        </div>

        {/* Player Management Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Player Management</h4>
          
          <Switch
            label="Injury Alerts"
            defaultChecked={preferences.injuryAlerts}
            onChange={(checked) => handlePreferenceChange('injuryAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified about injury updates for your selected players 🏥
          </p>
        </div>

        {/* Achievement Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Achievements</h4>
          
          <Switch
            label="Achievement Alerts"
            defaultChecked={preferences.achievementAlerts}
            onChange={(checked) => handlePreferenceChange('achievementAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified about your lineup milestones and achievements 🏆
          </p>
        </div>

        {/* Auto-Assistant Notifications */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Auto-Assistant</h4>
          
          <Switch
            label="Auto-Lineup Alerts"
            defaultChecked={preferences.autoLineupAlerts}
            onChange={(checked) => handlePreferenceChange('autoLineupAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified when auto-lineup sets your weekly lineup 🤖
          </p>

          <Switch
            label="Auto-Tips Alerts"
            defaultChecked={preferences.autoTipsAlerts}
            onChange={(checked) => handlePreferenceChange('autoTipsAlerts', checked)}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Get notified when auto-tips picks your weekly game predictions 🎯
          </p>
        </div>

        {/* Quiet Hours */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 dark:text-white">Quiet Hours</h4>
          
          <Switch
            label="Enable Quiet Hours"
            defaultChecked={preferences.quietHours.enabled}
            onChange={(checked) => handlePreferenceChange('quietHours', { ...preferences.quietHours, enabled: checked })}
            disabled={!preferences.enabled || hasPermission !== true}
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Pause notifications during your sleep hours 😴
          </p>
          
          {preferences.quietHours.enabled && (
            <div className="ml-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start time:
                </label>
                <input
                  type="time"
                  value={preferences.quietHours.start}
                  onChange={(e) => handlePreferenceChange('quietHours', { ...preferences.quietHours, start: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  disabled={!preferences.enabled || hasPermission !== true}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End time:
                </label>
                <input
                  type="time"
                  value={preferences.quietHours.end}
                  onChange={(e) => handlePreferenceChange('quietHours', { ...preferences.quietHours, end: e.target.value })}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  disabled={!preferences.enabled || hasPermission !== true}
                />
              </div>
            </div>
          )}
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