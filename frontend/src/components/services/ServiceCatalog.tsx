import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ClipboardDocumentCheckIcon,
  LightBulbIcon,
  ComputerDesktopIcon,
  AcademicCapIcon,
  BookOpenIcon,
  PlusIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

interface ServiceCatalogItem {
  category: string;
  subcategory?: string;
  name: string;
  description: string;
  basePrice: number;
  baseHours: number;
  pricingModel: string;
  billingCycle: string;
  isVatApplicable: boolean;
  vatRate: string;
  applicableEntityTypes: string[];
  tags: string[];
  isPopular: boolean;
}

interface ServiceCatalogProps {
  onImport?: (serviceName: string) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  COMPLIANCE: <ClipboardDocumentCheckIcon className="h-5 w-5" />,
  ADVISORY: <LightBulbIcon className="h-5 w-5" />,
  MTD_ITSA: <ComputerDesktopIcon className="h-5 w-5" />,
  SPECIALIST: <AcademicCapIcon className="h-5 w-5" />,
  BOOKKEEPING: <BookOpenIcon className="h-5 w-5" />,
};

const categoryLabels: Record<string, string> = {
  COMPLIANCE: 'Compliance',
  ADVISORY: 'Advisory',
  MTD_ITSA: 'MTD ITSA',
  SPECIALIST: 'Specialist',
  BOOKKEEPING: 'Bookkeeping',
};

const ServiceCatalog = ({ onImport }: ServiceCatalogProps) => {
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [filteredServices, setFilteredServices] = useState<ServiceCatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [importingServices, setImportingServices] = useState<Set<string>>(new Set());
  const [importedServices, setImportedServices] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCatalog();
  }, []);

  useEffect(() => {
    filterServices();
  }, [services, selectedCategory, searchQuery]);

  const loadCatalog = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get('/services/v2/catalog') as any;
      if (response.success) {
        setServices(response.data);
      }
    } catch (error) {
      toast.error('Failed to load service catalog');
    } finally {
      setIsLoading(false);
    }
  };

  const filterServices = () => {
    let filtered = services;

    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.description.toLowerCase().includes(query) ||
          s.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    setFilteredServices(filtered);
  };

  const handleImport = async (service: ServiceCatalogItem) => {
    if (importingServices.has(service.name) || importedServices.has(service.name)) {
      return;
    }

    setImportingServices((prev) => new Set(prev).add(service.name));

    try {
      const response = await apiClient.post('/services/v2/import-from-catalog', {
        serviceName: service.name,
      }) as any;

      if (response.success) {
        setImportedServices((prev) => new Set(prev).add(service.name));
        toast.success(`Imported: ${service.name}`);
        onImport?.(service.name);
      }
    } catch (error: any) {
      if (error.response?.data?.error?.code === 'SERVICE_EXISTS') {
        setImportedServices((prev) => new Set(prev).add(service.name));
        toast.success(`${service.name} already exists in your practice`);
      } else {
        toast.error(`Failed to import: ${service.name}`);
      }
    } finally {
      setImportingServices((prev) => {
        const next = new Set(prev);
        next.delete(service.name);
        return next;
      });
    }
  };

  const handleBulkImport = async (category: string) => {
    const categoryServices = services.filter((s) => s.category === category);
    const toImport = categoryServices.filter((s) => !importedServices.has(s.name));

    if (toImport.length === 0) {
      toast.success('All services in this category are already imported');
      return;
    }

    toast.loading(`Importing ${toImport.length} services...`);

    try {
      const response = await apiClient.post('/services/v2/bulk-import-catalog', {
        category: category === 'ALL' ? undefined : category,
      }) as any;

      if (response.success) {
        toast.dismiss();
        toast.success(
          `Imported ${response.data.imported} services, skipped ${response.data.skipped}`
        );
        
        // Mark all as imported
        const imported = new Set(importedServices);
        toImport.forEach((s) => imported.add(s.name));
        setImportedServices(imported);
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to import services');
    }
  };

  const categories = ['ALL', ...new Set(services.map((s) => s.category))];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-gray-900">Service Catalog</h3>
        <p className="mt-1 text-sm text-gray-500">
          Import pre-configured UK accounting services to your practice
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search services..."
          className="input-field pl-10 w-full"
        />
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedCategory === category
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {category === 'ALL' ? 'All Categories' : categoryLabels[category] || category}
            {category !== 'ALL' && (
              <span className="ml-2 text-xs opacity-75">
                ({services.filter((s) => s.category === category).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bulk Import Button */}
      {selectedCategory !== 'ALL' && (
        <div className="flex justify-end">
          <button
            onClick={() => handleBulkImport(selectedCategory)}
            className="btn-secondary text-sm"
          >
            Import All {categoryLabels[selectedCategory]} Services
          </button>
        </div>
      )}

      {/* Services List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredServices.map((service) => {
          const isImporting = importingServices.has(service.name);
          const isImported = importedServices.has(service.name);

          return (
            <div
              key={service.name}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="p-2 bg-primary-100 text-primary-600 rounded-lg">
                    {categoryIcons[service.category] || <ClipboardDocumentCheckIcon className="h-5 w-5" />}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{service.name}</h4>
                    <p className="text-sm text-gray-500 mt-1">{service.description}</p>
                    
                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {service.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                      {service.isPopular && (
                        <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                          Popular
                        </span>
                      )}
                    </div>

                    {/* Pricing Info */}
                    <div className="mt-3 flex items-center space-x-4 text-sm">
                      <span className="text-gray-600">
                        From <strong>£{service.basePrice.toLocaleString()}</strong>
                      </span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600">
                        {service.baseHours} hours
                      </span>
                      <span className="text-gray-400">|</span>
                      <span className="text-gray-600 capitalize">
                        {service.billingCycle.toLowerCase().replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleImport(service)}
                  disabled={isImporting || isImported}
                  className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isImported
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50'
                  }`}
                >
                  {isImporting ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : isImported ? (
                    <>
                      <CheckIcon className="h-4 w-4 mr-1" />
                      Added
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-4 w-4 mr-1" />
                      Import
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredServices.length === 0 && (
        <div className="text-center py-12">
          <ClipboardDocumentCheckIcon className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No services found</p>
        </div>
      )}
    </div>
  );
};

export default ServiceCatalog;
