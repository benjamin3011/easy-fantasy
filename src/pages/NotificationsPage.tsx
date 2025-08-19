import { useMemo, useState } from 'react';
import PageMeta from '../components/common/PageMeta';
import ComponentCard from '../components/common/ComponentCard';
import Button from '../components/ui/button/Button';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDocs, limit, orderBy, query, startAfter, Timestamp, updateDoc, where, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import type { UserNotificationDoc, NotificationType } from '../types/notifications';
import { useNavigate } from 'react-router';
import { NotificationIcon } from '../components/notifications/NotificationIcon';
import { 
  getNotificationDeepLink, 
  getNotificationTypeStyles, 
  getNotificationTypeLabel,
  formatNotificationTime 
} from '../utils/notificationHelpers';

export default function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<NotificationType | 'all'>('all');
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [items, setItems] = useState<UserNotificationDoc[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const baseKey = useMemo(() => ['notifications', user?.uid, filter, typeFilter], [user?.uid, filter, typeFilter]);

  const { isLoading } = useQuery<UserNotificationDoc[]>({
    queryKey: baseKey,
    enabled: !!user?.uid,
    queryFn: async () => {
      const col = collection(db, 'users', user!.uid, 'notifications');
      const constraints: any[] = [];
      if (filter === 'unread') constraints.push(where('readAt', '==', null));
      if (typeFilter !== 'all') constraints.push(where('type', '==', typeFilter));
      constraints.push(orderBy('createdAt', 'desc'));
      constraints.push(limit(20));
      const q = query(col, ...constraints);
      const snap = await getDocs(q);
      const mapped = snap.docs.map(d => {
        const raw = d.data() as any;
        return {
          id: d.id,
          type: raw.type,
          title: raw.title,
          body: raw.body,
          createdAt: (raw.createdAt as Timestamp)?.toDate?.() ?? new Date(),
          readAt: (raw.readAt as Timestamp | undefined)?.toDate?.(),
          data: raw.data,
          channel: raw.channel,
          source: raw.source,
        } as UserNotificationDoc;
      });
      setItems(mapped);
      setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
      return mapped;
    },
  });

  const unreadCount = useMemo(() => items.filter(n => !n.readAt).length, [items]);

  const loadMore = async () => {
    if (!user?.uid || !lastDoc) return;
    setIsLoadingMore(true);
    try {
      const col = collection(db, 'users', user.uid, 'notifications');
      const constraints: any[] = [];
      if (filter === 'unread') constraints.push(where('readAt', '==', null));
      if (typeFilter !== 'all') constraints.push(where('type', '==', typeFilter));
      constraints.push(orderBy('createdAt', 'desc'));
      constraints.push(startAfter(lastDoc));
      constraints.push(limit(20));
      const q = query(col, ...constraints);
      const snap = await getDocs(q);
      const mapped = snap.docs.map(d => {
        const raw = d.data() as any;
        return {
          id: d.id,
          type: raw.type,
          title: raw.title,
          body: raw.body,
          createdAt: (raw.createdAt as Timestamp)?.toDate?.() ?? new Date(),
          readAt: (raw.readAt as Timestamp | undefined)?.toDate?.(),
          data: raw.data,
          channel: raw.channel,
          source: raw.source,
        } as UserNotificationDoc;
      });
      setItems(prev => [...prev, ...mapped]);
      setLastDoc(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.uid) return;
      const col = collection(db, 'users', user.uid, 'notifications');
      const constraints: any[] = [where('readAt', '==', null)];
      if (typeFilter !== 'all') constraints.push(where('type', '==', typeFilter));
      const q = query(col, ...constraints);
      const snap = await getDocs(q);
      const now = Timestamp.now();
      await Promise.all(snap.docs.map(d => updateDoc(doc(db, d.ref.path), { readAt: now })));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: baseKey });
    }
  });

  const markOneRead = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.uid) return;
      const ref = doc(db, 'users', user.uid, 'notifications', id);
      await updateDoc(ref, { readAt: Timestamp.now() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: baseKey });
    }
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.uid) return;
      const ref = doc(db, 'users', user.uid, 'notifications', id);
      await deleteDoc(ref);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: baseKey });
    }
  });

  const handleNotificationClick = (notification: UserNotificationDoc) => {
    // Mark as read if unread
    if (!notification.readAt) {
      markOneRead.mutate(notification.id);
    }
    
    // Navigate to deep link
    const deepLink = getNotificationDeepLink(notification);
    if (deepLink) {
      navigate(deepLink);
    }
  };

  return (
    <>
      <PageMeta title="Notifications | Easy Fantasy" description="Your in-app notifications." />
      <div className="container mx-auto px-2 py-6 pb-content-safe">
        <div className="mb-6">
          <div className="hidden md:flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setFilter(filter === 'all' ? 'unread' : 'all')}>
                {filter === 'all' ? 'Show Unread' : 'Show All'}
              </Button>
              <select className="border rounded-md p-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
                <option value="all">All Types</option>
                <option value="lineup_deadline">{getNotificationTypeLabel('lineup_deadline')}</option>
                <option value="performance">{getNotificationTypeLabel('performance')}</option>
                <option value="captain_success">{getNotificationTypeLabel('captain_success')}</option>
                <option value="big_performance">{getNotificationTypeLabel('big_performance')}</option>
                <option value="scoring_update">{getNotificationTypeLabel('scoring_update')}</option>
                <option value="injury">{getNotificationTypeLabel('injury')}</option>
                <option value="achievement">{getNotificationTypeLabel('achievement')}</option>
                <option value="tips_reminder">{getNotificationTypeLabel('tips_reminder')}</option>
                <option value="system">{getNotificationTypeLabel('system')}</option>
              </select>
              <Button onClick={() => markAllRead.mutate()} disabled={unreadCount === 0}>Mark all read</Button>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">{unreadCount} unread</p>
        </div>

        <ComponentCard title="Recent">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No notifications</div>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {items.map((n) => {
                const { badgeClass, bgClass } = getNotificationTypeStyles(n.type);
                const deepLink = getNotificationDeepLink(n);
                
                return (
                  <li key={n.id} className={`py-4 transition-colors ${bgClass} ${deepLink ? 'cursor-pointer' : ''}`} onClick={() => deepLink && handleNotificationClick(n)}>
                    <div className="flex items-start gap-4">
                      <NotificationIcon type={n.type} className="w-6 h-6 mt-1" />
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${n.readAt ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blue-500'}`} />
                            <h3 className={`text-sm font-medium truncate ${n.readAt ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                              {n.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeClass}`}>
                              {getNotificationTypeLabel(n.type)}
                            </span>
                            <div className="flex items-center gap-1">
                              {!n.readAt && (
                                <Button 
                                  size="sm" 
                                  variant="outline" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markOneRead.mutate(n.id);
                                  }}
                                >
                                  Mark read
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm('Delete this notification?')) {
                                    deleteNotification.mutate(n.id);
                                  }
                                }}
                                title="Delete notification"
                              >
                                🗑️
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">{n.body}</p>
                        
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-gray-400 dark:text-gray-500">{formatNotificationTime(n.createdAt)}</p>
                          {deepLink && (
                            <span className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                              Click to view →
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lastDoc && (
            <div className="mt-4 flex justify-center">
              <Button onClick={loadMore} disabled={isLoadingMore}>{isLoadingMore ? 'Loading…' : 'Load more'}</Button>
            </div>
          )}
        </ComponentCard>
      </div>
    </>
  );
}


