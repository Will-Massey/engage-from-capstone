import { useLocation } from 'react-router-dom';
import { getPageMeta } from '../../config/navigation';
import PageHeader from './PageHeader';

/**
 * Automatic breadcrumbs from the current path (hidden on dashboard home).
 * Practice pages that own a full page chrome (Jobs, Workload, Letters) only
 * show breadcrumbs — avoids double H1 titles.
 */
const AppRouteHeader = () => {
  const { pathname } = useLocation();
  const meta = getPageMeta(pathname);

  if (pathname === '/') {
    return null;
  }

  // Pages that render their own H1 — only show breadcrumbs to avoid double titles
  const ownsChrome =
    pathname === '/jobs' ||
    pathname === '/jobs/workload' ||
    pathname === '/letters' ||
    pathname === '/inbox' ||
    pathname === '/forms' ||
    pathname === '/automations' ||
    pathname.startsWith('/integrations') ||
    pathname.startsWith('/jobs/');

  return (
    <PageHeader
      title={ownsChrome ? undefined : meta.title}
      description={ownsChrome ? undefined : meta.description}
      breadcrumbs={meta.breadcrumbs}
      backTo={
        ownsChrome && pathname.startsWith('/jobs/') && pathname !== '/jobs/workload'
          ? meta.backTo
          : ownsChrome
            ? undefined
            : meta.backTo
      }
    />
  );
};

export default AppRouteHeader;
