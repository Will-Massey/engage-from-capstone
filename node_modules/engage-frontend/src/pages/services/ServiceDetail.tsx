import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

const ServiceDetail = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="animate-fade-in">
      <Link
        to="/services"
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to services
      </Link>

      <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900">Service Details</h1>
        <p className="mt-2 text-slate-700">
          Service ID: {id}
        </p>
        <p className="mt-4 text-slate-600">
          This page is under construction. The full service management functionality
          will be available soon.
        </p>
      </div>
    </div>
  );
};

export default ServiceDetail;
