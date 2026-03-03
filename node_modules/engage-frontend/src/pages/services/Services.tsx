import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentIcon,
  LightBulbIcon,
  CalculatorIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';

const categoryIcons: Record<string, any> = {
  COMPLIANCE: ClipboardDocumentIcon,
  ADVISORY: LightBulbIcon,
  TECHNICAL: CalculatorIcon,
  SPECIALIZED: StarIcon,
};

const categoryColors: Record<string, string> = {
  COMPLIANCE: 'bg-blue-100 text-blue-800',
  ADVISORY: 'bg-green-100 text-green-800',
  TECHNICAL: 'bg-purple-100 text-purple-800',
  SPECIALIZED: 'bg-orange-100 text-orange-800',
};

const Services = () => {
  const { tenant } = useAuthStore();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  useEffect(() => {
    loadServices();
  }, [selectedCategory]);

  const loadServices = async () => {
    try {
      setIsLoading(true);
      const [servicesRes, categoriesRes] = await Promise.all([
        apiClient.getServices({
          category: selectedCategory || undefined,
          search: searchQuery || undefined,
        }) as Promise<any>,
        apiClient.getServiceCategories() as Promise<any>,
      ]);

      setServices(servicesRes.data || []);
      setCategories(categoriesRes.data || []);
    } catch (error) {
      console.error('Failed to load services', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadServices();
  };

  const duplicateService = async (id: string) => {
    try {
      await apiClient.duplicateService(id);
      toast.success('Service duplicated successfully');
      loadServices();
    } catch (error) {
      // Error handled by API interceptor
    }
  };

  const filteredServices = services.filter((service) =>
    searchQuery
      ? service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        service.description.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your service catalog and pricing
          </p>
        </div>
        <Link
          to="/services/new"
          className="btn-primary inline-flex"
          style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Service
        </Link>
      </div>

      {/* Search and filter */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field pl-10"
                placeholder="Search services..."
              />
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === ''
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Services grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="text-center py-16 card">
          <ClipboardDocumentIcon className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No services found</h3>
          <p className="mt-2 text-sm text-gray-500">
            Get started by adding your first service
          </p>
          <Link
            to="/services/new"
            className="mt-6 btn-primary inline-flex"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Service
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => {
            const Icon = categoryIcons[service.category] || ClipboardDocumentIcon;
            return (
              <div
                key={service.id}
                className="card p-5 hover:shadow-hover transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <Icon className="h-6 w-6 text-gray-500" />
                  </div>
                  <span className={`badge text-xs ${categoryColors[service.category] || 'bg-gray-100 text-gray-800'}`}>
                    {service.category}
                  </span>
                </div>

                <h3 className="mt-4 font-semibold text-gray-900">{service.name}</h3>
                <p className="mt-1 text-sm text-gray-500 line-clamp-2">{service.description}</p>

                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      £{service.basePrice?.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">base price</p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => duplicateService(service.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="Duplicate"
                    >
                      <ClipboardDocumentIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {service.isPopular && (
                  <div className="mt-3 flex items-center text-xs text-amber-600">
                    <StarIcon className="h-4 w-4 mr-1 fill-current" />
                    Popular service
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Add missing import
import toast from 'react-hot-toast';

export default Services;
