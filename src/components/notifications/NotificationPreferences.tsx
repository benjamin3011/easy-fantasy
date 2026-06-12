import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { sendTestNotificationCallable } from '../../firebase/callables';
import { useAuth } from '../../context/AuthContext';
import { getNotificationPermission, registerPushNotifications, type PushRegistrationResult } from '../../services/pushRegistration';
import ComponentCard from '../common/ComponentCard';
import Button from '../ui/button/Button';
import Switch from '../form/switch/Switch';
import type { NotificationPreferences as NotificationPrefs } from '../../types/notifications';

const defaultPreferences: NotificationPrefs = {
  enabled: true,
  lineupDeadlineAlerts: true,
  lineupDeadlineMinutes: 180,
  tipsReminderAlerts: true,
  tipsReminderMinutes: 180,
  scoringAlerts: true,
  captainSuccessAlerts: true,
  injuryAlerts: false,
  achievementAlerts: false,
  autoLineupAlerts: false,
  autoTipsAlerts: false,
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

type PreferenceValue = boolean | number | NotificationPrefs['quietHours'];

function mergePreferences(prefs?: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    ...defaultPreferences,
    ...(prefs ?? {}),
    quietHours: {
      ...defaultPreferences.quietHours,
      ...(prefs?.quietHours ?? {}),
    },
  };
}

function permissionLabel(permission: ReturnType<typeof getNotificationPermission>): string {
  if (permission === 'unsupported') return 'Not supported on this browser';
  if (permission === 'granted') return 'Enabled on this device';
  if (permission === 'denied') return 'Blocked in browser settings';
  return 'Not enabled yet';
}

export const NotificationPreferencesComponent: React.FC = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [localPrefs, setLocalPrefs] = useState<NotificationPrefs>(defaultPreferences);
  const [hasChanges, setHasChanges] = useState(false);
  const [permission, setPermission] = useState<ReturnType<typeof getNotificationPermission>>('unsupported');
  const [registrationResult, setRegistrationResult] = useState<PushRegistrationResult | null>(null);

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const { isLoading } = useQuery({
    queryKey: ['userPreferences', user?.uid],
    enabled: !!user?.uid,
    queryFn: async () => {
      const userDoc = await getDoc(doc(db, 'users', user!.uid));
      const prefs = mergePreferences(userDoc.data()?.notificationPreferences as Partial<NotificationPrefs> | undefined);
      setLocalPrefs(prefs);
      return prefs;
    },
  });

  const updatePreferences = useMutation({
    mutationFn: async (newPrefs: NotificationPrefs) => {
      if (!user?.uid) return newPrefs;
      await setDoc(doc(db, 'users', user.uid), { notificationPreferences: newPrefs }, { merge: true });
      return newPrefs;
    },
    onSuccess: (newPrefs) => {
      qc.setQueryData(['userPreferences', user?.uid], newPrefs);
      setHasChanges(false);
    },
  });

  const enablePush = useMutation({
    mutationFn: async () => registerPushNotifications(user?.uid ?? null, { requestPermission: true }),
    onSuccess: (result) => {
      setRegistrationResult(result);
      setPermission(getNotificationPermission());
    },
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const result = await sendTestNotificationCallable();
      return result.data;
    },
  });

  const updateLocalPreference = (key: keyof NotificationPrefs, value: PreferenceValue) => {
    setLocalPrefs((current) => ({ ...current, [key]: value }));
    setHasChanges(true);
  };

  const updateQuietHours = (key: keyof NotificationPrefs['quietHours'], value: boolean | string) => {
    setLocalPrefs((current) => ({
      ...current,
      quietHours: {
        ...current.quietHours,
        [key]: value,
      },
    }));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <ComponentCard title="Notifications">
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Loading notification settings...
        </div>
      </ComponentCard>
    );
  }

  const permissionGranted = permission === 'granted';

  return (
    <ComponentCard title="Notifications">
      <div className="space-y-6">
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-medium text-gray-900 dark:text-white">Phone push status</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{permissionLabel(permission)}</p>
              {registrationResult && (
                <p className={`mt-1 text-sm ${registrationResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {registrationResult.message}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => enablePush.mutate()}
                disabled={enablePush.isPending || permission === 'unsupported'}
                variant={permissionGranted ? 'outline' : 'primary'}
              >
                {enablePush.isPending ? 'Enabling...' : permissionGranted ? 'Refresh Device' : 'Enable Push'}
              </Button>
              <Button
                onClick={() => sendTest.mutate()}
                disabled={sendTest.isPending || !permissionGranted}
                variant="outline"
              >
                {sendTest.isPending ? 'Sending...' : 'Send Test'}
              </Button>
            </div>
          </div>
          {sendTest.data && (
            <p className="mt-3 text-sm text-green-600 dark:text-green-400">
              {sendTest.data.message}
            </p>
          )}
          {sendTest.error && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              {sendTest.error instanceof Error ? sendTest.error.message : 'Failed to send test notification.'}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-900 dark:text-white">Enable reminders</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Master switch for lineup, tips, and scoring alerts.</p>
          </div>
          <Switch
            label=""
            checked={localPrefs.enabled}
            onChange={(checked) => updateLocalPreference('enabled', checked)}
          />
        </div>

        {localPrefs.enabled && (
          <>
            <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
              <h3 className="mb-4 text-base font-medium text-gray-900 dark:text-white">Game reminders</h3>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Lineup reminder</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Warn me before a game starts if my lineup is incomplete.</p>
                  </div>
                  <Switch
                    label=""
                    checked={localPrefs.lineupDeadlineAlerts}
                    onChange={(checked) => updateLocalPreference('lineupDeadlineAlerts', checked)}
                  />
                </div>

                {localPrefs.lineupDeadlineAlerts && (
                  <ReminderWindowSelect
                    id="lineupReminderWindow"
                    value={localPrefs.lineupDeadlineMinutes}
                    onChange={(value) => updateLocalPreference('lineupDeadlineMinutes', value)}
                  />
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Tips reminder</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Warn me before kick-off if I have not submitted weekly tips.</p>
                  </div>
                  <Switch
                    label=""
                    checked={localPrefs.tipsReminderAlerts}
                    onChange={(checked) => updateLocalPreference('tipsReminderAlerts', checked)}
                  />
                </div>

                {localPrefs.tipsReminderAlerts && (
                  <ReminderWindowSelect
                    id="tipsReminderWindow"
                    value={localPrefs.tipsReminderMinutes}
                    onChange={(value) => updateLocalPreference('tipsReminderMinutes', value)}
                  />
                )}
              </div>
            </section>

            <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
              <h3 className="mb-4 text-base font-medium text-gray-900 dark:text-white">Scoring</h3>
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Scoring alerts</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Notify me about relevant player scoring updates.</p>
                  </div>
                  <Switch
                    label=""
                    checked={localPrefs.scoringAlerts}
                    onChange={(checked) => updateLocalPreference('scoringAlerts', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Captain success</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Notify me when my captain pick performs well.</p>
                  </div>
                  <Switch
                    label=""
                    checked={localPrefs.captainSuccessAlerts}
                    onChange={(checked) => updateLocalPreference('captainSuccessAlerts', checked)}
                  />
                </div>
              </div>
            </section>

            <section className="border-t border-gray-200 pt-6 dark:border-gray-700">
              <h3 className="mb-4 text-base font-medium text-gray-900 dark:text-white">Quiet hours</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Pause at night</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Skip reminders during this window.</p>
                  </div>
                  <Switch
                    label=""
                    checked={localPrefs.quietHours.enabled}
                    onChange={(checked) => updateQuietHours('enabled', checked)}
                  />
                </div>

                {localPrefs.quietHours.enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm text-gray-700 dark:text-gray-300">
                      Start
                      <input
                        type="time"
                        value={localPrefs.quietHours.start}
                        onChange={(event) => updateQuietHours('start', event.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                    </label>
                    <label className="text-sm text-gray-700 dark:text-gray-300">
                      End
                      <input
                        type="time"
                        value={localPrefs.quietHours.end}
                        onChange={(event) => updateQuietHours('end', event.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                    </label>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {hasChanges && (
          <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
            <Button
              onClick={() => updatePreferences.mutate(localPrefs)}
              disabled={updatePreferences.isPending}
              className="w-full sm:w-auto"
            >
              {updatePreferences.isPending ? 'Saving...' : 'Save Notification Settings'}
            </Button>
          </div>
        )}
      </div>
    </ComponentCard>
  );
};

interface ReminderWindowSelectProps {
  id: string;
  value: number;
  onChange: (value: number) => void;
}

function ReminderWindowSelect({ id, value, onChange }: ReminderWindowSelectProps) {
  return (
    <label htmlFor={id} className="ml-4 block text-sm font-medium text-gray-700 dark:text-gray-300">
      Reminder window
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(parseInt(event.target.value, 10))}
        className="mt-1 block rounded-md border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-800"
      >
        <option value={15}>15 minutes before</option>
        <option value={30}>30 minutes before</option>
        <option value={60}>1 hour before</option>
        <option value={120}>2 hours before</option>
        <option value={180}>3 hours before</option>
        <option value={360}>6 hours before</option>
        <option value={720}>12 hours before</option>
        <option value={1440}>1 day before</option>
      </select>
    </label>
  );
}

export default NotificationPreferencesComponent;
