import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { NATIVE_DEEP_LINK_EVENT, consumePendingNativeDeepLink } from '../../lib/nativeDeepLinks';

/**
 * Routes Capacitor client deep links through React Router. initNativeShell
 * can fire before this mounts, so we consume any queued path on first paint.
 */
export default function NativeDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const go = (path: string) => {
      navigate(path, { replace: true });
    };

    const pending = consumePendingNativeDeepLink();
    if (pending) go(pending);

    const onLink = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (path) go(path);
    };

    window.addEventListener(NATIVE_DEEP_LINK_EVENT, onLink);
    return () => window.removeEventListener(NATIVE_DEEP_LINK_EVENT, onLink);
  }, [navigate]);

  return null;
}
