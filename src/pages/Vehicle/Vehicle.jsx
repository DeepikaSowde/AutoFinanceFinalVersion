import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import VehicleStatusTabs from '../../components/vehicle/VehicleStatusTabs';
import VehicleSummaryCards from '../../components/vehicle/VehicleSummaryCards';
import VehicleSearchAndFilter from '../../components/vehicle/VehicleSearchAndFilter';
import VehicleCardGrid from '../../components/vehicle/VehicleCardGrid';
import VehicleDetailsView from './VehicleDetailsView';
import ActiveVehicleModal from '../../components/vehicle/ActiveVehicleModal';

/**
 * Vehicle Management Page matching visual reference:
 * - Clean left-aligned title & subtitle
 * - Status navigation tabs: All Vehicles (default), Seized, Released, Sold
 * - Search bar and vehicle-type dropdown filter
 * - Four real-data summary KPI cards (Total, Seized, Released, Sold)
 * - Responsive vehicle card grid (4 cols on desktop, 2 on tablet, 1 on mobile)
 * - View Details opening vehicle specifics with full back navigation
 * - No top-right admin avatar, notification icon, or extra navigation bar
 */
const Vehicle = () => {
  const navigate = useNavigate();

  // Selected vehicle for details view
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  // Tab filter: 'all' | 'seized' | 'released' | 'sold'
  const [activeTab, setActiveTab] = useState('all');

  // Search input query
  const [searchQuery, setSearchQuery] = useState('');

  // Vehicle type filter
  const [selectedType, setSelectedType] = useState('All Vehicle Types');

  // Customer/loan raw records from localStorage
  const [rawRecords, setRawRecords] = useState([]);

  // Load from localStorage and listen to updates
  useEffect(() => {
    const loadData = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
        setRawRecords(stored);
      } catch (err) {
        console.error('Failed to load vehicle data from localStorage:', err);
        setRawRecords([]);
      }
    };

    loadData();
    window.addEventListener('storage', loadData);
    return () => window.removeEventListener('storage', loadData);
  }, []);

  // Normalize vehicle records from loan/customer storage
  const allVehicles = useMemo(() => {
    return rawRecords
      .filter((record) => {
        // Must contain vehicle info (at least a vehicle object or registration)
        return record && (record.vehicle || record.vehicleAmount);
      })
      .map((record, index) => {
        const vehicle = record.vehicle || {};
        const customer = record.customer || {};

        // Read actual current status
        const rawStatus = (record.vehicleStatus || vehicle.status || 'Active').trim();
        let normalizedStatus = 'Active';
        const lower = rawStatus.toLowerCase();
        if (lower === 'seized') normalizedStatus = 'Seized';
        else if (lower === 'released') normalizedStatus = 'Released';
        else if (lower === 'sold') normalizedStatus = 'Sold';
        else normalizedStatus = 'Active';

        return {
          ...record,
          vehicleId: record.loanId || `VEH-${String(index + 1).padStart(3, '0')}`,
          vehicleStatus: normalizedStatus,
          customer,
          vehicle: {
            ...vehicle,
            status: normalizedStatus,
          },
        };
      });
  }, [rawRecords]);

  // Calculate real-data KPIs
  const summaryCounts = useMemo(() => {
    const totalCount = allVehicles.length;
    const seizedCount = allVehicles.filter((v) => v.vehicleStatus === 'Seized').length;
    const releasedCount = allVehicles.filter((v) => v.vehicleStatus === 'Released').length;
    const soldCount = allVehicles.filter((v) => v.vehicleStatus === 'Sold').length;

    return {
      totalCount,
      seizedCount,
      releasedCount,
      soldCount,
    };
  }, [allVehicles]);

  // Filter vehicles by active tab, search query, and vehicle type
  const filteredVehicles = useMemo(() => {
    return allVehicles.filter((item) => {
      const v = item.vehicle || {};
      const c = item.customer || {};

      // 1. Status Tab filter
      // - 'all': show all vehicles
      // - 'seized': only seized
      // - 'released': only released
      // - 'sold': only sold
      if (activeTab === 'seized' && item.vehicleStatus !== 'Seized') return false;
      if (activeTab === 'released' && item.vehicleStatus !== 'Released') return false;
      if (activeTab === 'sold' && item.vehicleStatus !== 'Sold') return false;

      // 2. Vehicle Type filter
      if (selectedType && selectedType !== 'All Vehicle Types') {
        const vType = (v.type || '').trim().toLowerCase();
        if (vType !== selectedType.trim().toLowerCase()) return false;
      }

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const regNo = (v.regNo || '').toLowerCase();
        const custName = (c.name || '').toLowerCase();
        const custMobile = (c.mobile || '').toLowerCase();
        const brand = (v.brand || '').toLowerCase();
        const model = (v.model || '').toLowerCase();

        const matches =
          regNo.includes(q) ||
          custName.includes(q) ||
          custMobile.includes(q) ||
          brand.includes(q) ||
          model.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [allVehicles, activeTab, selectedType, searchQuery]);

  // Active vehicle popup modal state
  const [activeVehicleForModal, setActiveVehicleForModal] = useState(null);

  // Handle View Details click:
  // - For Active vehicles: open the centered ActiveVehicleModal popup without full-page navigation
  // - For Seized, Released, Sold: retain full-page VehicleDetailsView screen
  const handleViewDetails = (rec) => {
    const status = (rec.vehicleStatus || rec.vehicle?.status || 'Active').trim();
    if (status.toLowerCase() === 'active') {
      setActiveVehicleForModal(rec);
    } else {
      setSelectedVehicle(rec);
    }
  };

  // If viewing details of a non-active vehicle (Seized, Released, Sold), render VehicleDetailsView full-page
  if (selectedVehicle) {
    return (
      <div className="flex-1 min-h-screen bg-[#F8FAFC] px-3 sm:px-6 py-5 sm:py-6 font-sans">
        <div className="w-full max-w-7xl mx-auto">
          <VehicleDetailsView
            vehicleRecord={selectedVehicle}
            onBack={() => {
              setSelectedVehicle(null);
              try {
                const stored = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
                setRawRecords(stored);
              } catch (e) {
                console.error(e);
              }
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen bg-[#F8FAFC] px-3 sm:px-6 py-5 sm:py-6 font-sans">
      <div className="w-full max-w-7xl mx-auto space-y-5">
        {/* =========================================================
            1. PAGE HEADER (Clean, left-aligned, no admin/bell controls)
        ========================================================= */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Vehicle Management
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 font-medium">
            Manage and track all vehicles in one place.
          </p>
        </div>

        {/* =========================================================
            2. STATUS NAVIGATION TABS
        ========================================================= */}
        <VehicleStatusTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* =========================================================
            3. SEARCH BAR AND VEHICLE-TYPE FILTER
        ========================================================= */}
        <VehicleSearchAndFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedType={selectedType}
          onTypeChange={setSelectedType}
        />

        {/* =========================================================
            4. SUMMARY KPI CARDS (Real data counts)
        ========================================================= */}
        <VehicleSummaryCards
          totalCount={summaryCounts.totalCount}
          seizedCount={summaryCounts.seizedCount}
          releasedCount={summaryCounts.releasedCount}
          soldCount={summaryCounts.soldCount}
        />

        {/* =========================================================
            5. VEHICLE CARD GRID
        ========================================================= */}
        <VehicleCardGrid
          vehicles={filteredVehicles}
          onViewDetails={handleViewDetails}
          onAddVehicle={() => navigate('/newloan')}
        />

        {/* =========================================================
            6. ACTIVE VEHICLE DETAILS POPUP MODAL
        ========================================================= */}
        <ActiveVehicleModal
          isOpen={Boolean(activeVehicleForModal)}
          onClose={() => setActiveVehicleForModal(null)}
          vehicleRecord={activeVehicleForModal}
          onSeizureSuccess={() => {
            // Force re-read from storage
            try {
              const stored = JSON.parse(localStorage.getItem('motoLendCustomersList_data') || '[]');
              setRawRecords(stored);
            } catch (err) {
              console.error(err);
            }
          }}
        />
      </div>
    </div>
  );
};

export default Vehicle;
