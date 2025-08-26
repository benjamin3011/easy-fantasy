import { useMemo, useState, useEffect } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { BottomSheet } from "../ui/bottomsheet/BottomSheet";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, doc, getDocs, limit, orderBy, query, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../../firebase/firebase";
import { useAuth } from "../../context/AuthContext";
import type { UserNotificationDoc } from "../../types/notifications";
import { NotificationIcon } from "../notifications/NotificationIcon";
import { getNotificationDeepLink, getNotificationTypeStyles, formatNotificationTime } from "../../utils/notificationHelpers";

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Detect mobile screen size
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const { data: notifications = [] } = useQuery<UserNotificationDoc[]>({
    queryKey: ["notifications", user?.uid, "dropdown"],
    enabled: !!user?.uid,
    queryFn: async () => {
      const col = collection(db, "users", user!.uid, "notifications");
      // Get recent notifications (last 7 days) to show in dropdown
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const q = query(
        col, 
        where("createdAt", ">=", Timestamp.fromDate(sevenDaysAgo)),
        orderBy("createdAt", "desc"), 
        limit(15)
      );
      const snap = await getDocs(q);
      const allNotifications: UserNotificationDoc[] = snap.docs.map(d => {
        const raw = d.data() as Partial<UserNotificationDoc> & { createdAt?: Timestamp; readAt?: Timestamp };
        return {
          id: d.id,
          type: raw.type!,
          title: raw.title || '',
          body: raw.body || '',
          createdAt: raw.createdAt?.toDate?.() ?? new Date(),
          readAt: raw.readAt?.toDate?.(),
          data: raw.data,
          channel: raw.channel,
          source: raw.source,
        };
      });
      
      // Sort: unread first, then by date
      return allNotifications.sort((a, b) => {
        if (!a.readAt && b.readAt) return -1; // Unread comes first
        if (a.readAt && !b.readAt) return 1;  // Read comes second
        return b.createdAt.getTime() - a.createdAt.getTime(); // Then by date
      });
    }
  });

  const unreadCount = useMemo(() => notifications.filter(n => !n.readAt).length, [notifications]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user?.uid) return;
      const col = collection(db, "users", user.uid, "notifications");
      const q = query(col, where("readAt", "==", null));
      const snap = await getDocs(q);
      const now = Timestamp.now();
      await Promise.all(snap.docs.map(d => updateDoc(doc(db, d.ref.path), { readAt: now })));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.uid, "dropdown"] });
    }
  });

  const markOneRead = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.uid) return;
      const ref = doc(db, "users", user.uid, "notifications", id);
      await updateDoc(ref, { readAt: Timestamp.now() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.uid, "dropdown"] });
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
    
    // Close dropdown
    closeDropdown();
  };

  function toggleDropdown() { setIsOpen(!isOpen); }
  function closeDropdown() { setIsOpen(false); }

  const handleClick = () => { toggleDropdown(); };

  // Shared content for both dropdown and bottom sheet
  const notificationContent = (
    <>
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
        <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Notifications {unreadCount > 0 ? `(${unreadCount})` : ''}
        </h5>
        <button 
          onClick={() => markAllRead.mutate()} 
          className="text-gray-500 transition dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Mark all read
        </button>
      </div>
      
      <ul className="flex flex-col h-auto overflow-y-auto custom-scrollbar max-h-96">
        {notifications.map((n) => {
          const { bgClass } = getNotificationTypeStyles(n.type);
          return (
            <li key={n.id}>
              <button 
                onClick={() => handleNotificationClick(n)} 
                className={`w-full text-left flex gap-3 rounded-lg border-b border-gray-100 p-3 px-4.5 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${bgClass} dark:border-gray-800`}
              >
                <div className="flex items-start gap-3 w-full">
                  <NotificationIcon type={n.type} className="w-5 h-5 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${n.readAt ? 'bg-gray-300 dark:bg-gray-600' : 'bg-blue-500'}`} />
                      <span className={`text-sm font-medium truncate ${n.readAt ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-white'}`}>
                        {n.title}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1">{n.body}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{formatNotificationTime(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {notifications.length === 0 && (
          <li className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2L3 7v11a1 1 0 001 1h12a1 1 0 001-1V7l-7-5z" />
              </svg>
              <span>No notifications yet</span>
            </div>
          </li>
        )}
      </ul>
      
      <Link 
        to="/notifications" 
        onClick={closeDropdown}
        className="block px-4 py-2 mt-3 text-sm font-medium text-center text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        View All Notifications
      </Link>
    </>
  );

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full dropdown-toggle hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={handleClick}
      >
        <span className={`absolute right-0 top-0.5 z-10 h-2 w-2 rounded-full bg-orange-400 ${unreadCount > 0 ? "flex" : "hidden"}`}>
          <span className="absolute inline-flex w-full h-full bg-orange-400 rounded-full opacity-75 animate-ping"></span>
        </span>
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      {/* Desktop: Dropdown */}
      {!isMobile && (
        <Dropdown
          isOpen={isOpen}
          onClose={closeDropdown}
          className="absolute right-0 mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px]"
        >
          {notificationContent}
        </Dropdown>
      )}

      {/* Mobile: Bottom Sheet */}
      {isMobile && (
        <BottomSheet
          isOpen={isOpen}
          onClose={closeDropdown}
          title="Notifications"
          className="max-h-[80vh]"
        >
          {notificationContent}
        </BottomSheet>
      )}
    </div>
  );
}


