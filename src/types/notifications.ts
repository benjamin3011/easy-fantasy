export type NotificationType =
  | 'lineup_deadline'
  | 'performance'
  | 'captain_success'
  | 'big_performance'
  | 'scoring_update'
  | 'injury'
  | 'achievement'
  | 'tips_reminder'
  | 'system';

export interface UserNotificationDoc {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: Date;
  readAt?: Date | null;
  data?: Record<string, unknown>;
  channel?: 'fcm' | 'webpush' | 'inapp' | 'push';
  source?: string;
}

export interface NotificationPreferences {
  // Lineup Management
  lineupDeadlineAlerts: boolean;
  lineupDeadlineMinutes: number; // How many minutes before game start to alert
  tipsReminderAlerts: boolean;
  tipsReminderMinutes: number;
  
  // Personal Performance  
  scoringAlerts: boolean;
  captainSuccessAlerts: boolean;
  
  // Player Management
  injuryAlerts: boolean;
  
  // Personal Achievements
  achievementAlerts: boolean;
  
  // Auto-Assistant Features
  autoLineupAlerts: boolean; // Notify when auto-lineup is applied
  autoTipsAlerts: boolean;   // Notify when auto-tips are applied
  
  // System
  enabled: boolean; // Master toggle
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string;   // "08:00"
  };
}


