import { useLocation } from 'react-router-dom';
import { getPageMeta } from '../../config/navigation';
import PageHeader from './PageHeader';

/**
 * Automatic breadcrumbs from the current path (hidden on dashboard home).
 */
const AppRouteHeader = () => {
  const { pathname } = useLocation();
  const meta = getPageMeta(pathname);

  if (pathname === '/') {
    return null;
  }

  return (
    <PageHeader
      title={meta.title}
      description={meta.description}
      breadcrumbs={meta.breadcrumbs}
      backTo={meta.backTo}
    />
  );
};

export default AppRouteHeader;
