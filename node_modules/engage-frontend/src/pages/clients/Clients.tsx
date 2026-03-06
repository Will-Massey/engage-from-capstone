import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  UserIcon,
  UsersIcon,
  HomeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';

const Clients = () => {
  const { tenant } = useAuthStore();
  const [clients, setClients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });

  useEffect(() => {
    loadClients();
  }, [meta.page]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getClients({
        page: meta.page,
        limit: 20,
        search: searchQuery || undefined,
      }) as any;

      setClients(response.data || []);
      setMeta(response.meta || { page: 1, totalPages: 1, total: 0 });
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setMeta({ ...meta, page: 1 });
    loadClients();
  };

  const getCompanyTypeIcon = (type: string) => {
    switch (type) {
      case 'LIMITED_COMPANY':
        return <BuildingOfficeIcon className="h-5 w-5 text-blue-500" />;
      case 'SOLE_TRADER':
        return <UserIcon className="h-5 w-5 text-green-500" />;
      case 'PARTNERSHIP':
        return <UsersIcon className="h-5 w-5 text-purple-500" />;
      case 'LLP':
        return <BuildingOfficeIcon className="h-5 w-5 text-indigo-500" />;
      case 'CHARITY':
      case 'NON_PROFIT':
        return <HomeIcon className="h-5 w-5 text-pink-500" />;
      default:
        return <BuildingOfficeIcon className="h-5 w-5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your client relationships and MTD ITSA status
          </p>
        </div>
        <Link
          to="/clients/new"
          className="btn-primary inline-flex"
          style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Client
        </Link>
      </div>

      {/* MTD ITSA Alert */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-lg p-4 text-white">
        <div className="flex items-start">
          <ClockIcon className="h-6 w-6 mt-0.5 flex-shrink-0" />
          <div className="ml-3">
            <h3 className="text-lg font-semibold">MTD ITSA Deadline: April 2026</h3>
            <p className="mt-1 text-orange-100">
              Sole traders and partnerships with income over £50,000 must be ready for Making Tax Digital.
              Limited companies, LLPs, and charities are not affected.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <form onSubmit={handleSearch} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            placeholder="Search clients by name, email, company number..."
          />
        </form>
      </div>

      {/* Clients grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
          <UsersIcon className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No clients yet</h3>
          <p className="mt-2 text-sm text-slate-500">
            Get started by adding your first client
          </p>
          <Link
            to="/clients/new"
            className="mt-6 btn-primary inline-flex"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Client
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    {getCompanyTypeIcon(client.companyType)}
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-semibold text-slate-900">{client.name}</h3>
                    <p className="text-xs text-slate-500">
                      {client.companyType?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                {client.mtditsaEligible && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                    MTD ITSA
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-sm text-slate-700 font-medium">{client.contactEmail}</p>
                {client.contactPhone && (
                  <p className="text-sm text-slate-600">{client.contactPhone}</p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {client._count?.proposals || 0} proposals
                </span>
                {client.turnover && (
                  <span className="text-slate-900 font-semibold">
                    £{(client.turnover / 1000).toFixed(0)}k turnover
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing page {meta.page} of {meta.totalPages}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setMeta({ ...meta, page: meta.page - 1 })}
              disabled={meta.page === 1}
              className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setMeta({ ...meta, page: meta.page + 1 })}
              disabled={meta.page === meta.totalPages}
              className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};



export default Clients;
