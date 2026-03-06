import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-900">404</h1>
        <p className="mt-4 text-xl text-slate-700">Page not found</p>
        <p className="mt-2 text-slate-600">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
        >
          Go back home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
