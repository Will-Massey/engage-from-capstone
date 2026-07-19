import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import {
  hasUnseenNotifications,
  notificationTarget,
  notificationTitle,
  type NotificationItem,
} from '../../utils/notifications';

const LAST_SEEN_KEY = 'engage:notifications:lastSeen';

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const NotificationsBell = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unseen, setUnseen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const res = (await apiClient.getNotifications()) as any;
      if (res?.success && Array.isArray(res.data)) {
        setItems(res.data);
        setUnseen(hasUnseenNotifications(res.data, localStorage.getItem(LAST_SEEN_KEY)));
      }
    } catch {
      // non-fatal — the bell just stays quiet
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
      setUnseen(false);
      load();
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        data-testid="notifications-bell"
        aria-label="Notifications"
        onClick={toggle}
        className="p-2 text-slate-500 dark:text-slate-300 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 relative transition-colors"
      >
        <BellIcon className="w-6 h-6" />
        {unseen && (
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-500 rounded-full"
            style={{ boxShadow: '0 0 8px rgba(99, 102, 241, 0.6)' }}
          ></span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl animate-scale-in z-50 bg-white/95 dark:bg-slate-900/95 border border-slate-200/50 dark:border-slate-700/50"
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
          }}
        >
          <div className="px-4 py-3 text-sm font-semibold text-slate-900 dark:text-white border-b border-slate-200/50 dark:border-slate-700/50">
            Notifications
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              Nothing yet — client activity will show up here.
            </div>
          ) : (
            items.map((item) => {
              const target = notificationTarget(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={!target}
                  onClick={() => {
                    if (target) {
                      setOpen(false);
                      navigate(target);
                    }
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors disabled:cursor-default"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {notificationTitle(item.action)}
                  </div>
                  {item.description && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {item.description}
                    </div>
                  )}
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    {timeAgo(item.createdAt)}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsBell;
