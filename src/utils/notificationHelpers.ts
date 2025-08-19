import type { NotificationType, UserNotificationDoc } from '../types/notifications';

/**
 * Get the deep link URL for a notification based on its type and data
 */
export function getNotificationDeepLink(notification: UserNotificationDoc): string | null {
  const { type, data } = notification;

  switch (type) {
    case 'lineup_deadline':
      if (data?.leagueId && data?.week) {
        return `/leagues/${data.leagueId}/lineup/${data.week}`;
      }
      return '/leagues';

    case 'performance':
    case 'captain_success':
    case 'big_performance':
    case 'scoring_update':
      if (data?.leagueId) {
        return `/leagues/${data.leagueId}`;
      }
      return '/';

    case 'injury':
      if (data?.leagueId && data?.week) {
        return `/leagues/${data.leagueId}/lineup/${data.week}`;
      }
      return '/leagues';

    case 'achievement':
      if (data?.leagueId) {
        return `/leagues/${data.leagueId}`;
      }
      return '/';

    case 'tips_reminder':
      return '/tips';

    case 'system':
      return '/';

    default:
      return null;
  }
}

/**
 * Get a user-friendly label for the notification type
 */
export function getNotificationTypeLabel(type: NotificationType): string {
  switch (type) {
    case 'lineup_deadline':
      return 'Lineup Deadline';
    case 'performance':
      return 'Performance Alert';
    case 'captain_success':
      return 'Captain Success';
    case 'big_performance':
      return 'Big Performance';
    case 'scoring_update':
      return 'Scoring Update';
    case 'injury':
      return 'Injury Update';
    case 'achievement':
      return 'Achievement';
    case 'tips_reminder':
      return 'Tips Reminder';
    case 'system':
      return 'System';
    default:
      return 'Notification';
  }
}

/**
 * Get CSS classes for notification type styling
 */
export function getNotificationTypeStyles(type: NotificationType): {
  badgeClass: string;
  bgClass: string;
} {
  switch (type) {
    case 'lineup_deadline':
      return {
        badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
        bgClass: 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
      };
    case 'performance':
      return {
        badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        bgClass: 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
      };
    case 'captain_success':
      return {
        badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        bgClass: 'hover:bg-green-50 dark:hover:bg-green-900/20'
      };
    case 'big_performance':
      return {
        badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
        bgClass: 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
      };
    case 'scoring_update':
      return {
        badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
        bgClass: 'hover:bg-teal-50 dark:hover:bg-teal-900/20'
      };
    case 'injury':
      return {
        badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        bgClass: 'hover:bg-red-50 dark:hover:bg-red-900/20'
      };
    case 'achievement':
      return {
        badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        bgClass: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
      };
    case 'tips_reminder':
      return {
        badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        bgClass: 'hover:bg-purple-50 dark:hover:bg-purple-900/20'
      };
    case 'system':
      return {
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        bgClass: 'hover:bg-gray-50 dark:hover:bg-gray-900/20'
      };
    default:
      return {
        badgeClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        bgClass: 'hover:bg-gray-50 dark:hover:bg-gray-900/20'
      };
  }
}

/**
 * Format notification timestamp with relative time
 */
export function formatNotificationTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  } else {
    return date.toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

/**
 * Get priority level for notification sorting
 */
export function getNotificationPriority(type: NotificationType): number {
  switch (type) {
    case 'lineup_deadline':
      return 1; // Highest priority
    case 'injury':
      return 2;
    case 'performance':
      return 3;
    case 'captain_success':
      return 2; // High priority
    case 'big_performance':
      return 3;
    case 'scoring_update':
      return 4;
    case 'achievement':
      return 4;
    case 'tips_reminder':
      return 5;
    case 'system':
      return 6; // Lowest priority
    default:
      return 5;
  }
}
