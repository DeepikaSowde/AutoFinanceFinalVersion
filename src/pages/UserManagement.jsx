import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  UserPlus,
  Search,
  Check,
  X,
  Eye,
  EyeOff,
  Edit,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Phone,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  UserRound,
  LayoutDashboard,
  HandCoins,
  WalletCards,
  Car,
  ReceiptText,
  UsersRound,
  Landmark,
  BellRing,
  UserCog,
  Settings,
} from 'lucide-react';
import {
  getUsers,
  createUser,
  updateUser,
  getRolePermissions,
  saveRolePermissions,
  resetRolePermissions,
  getCurrentUser,
  setCurrentUser,
  NAVIGATION_ITEMS,
  USER_UPDATE_EVENT,
  PERMISSION_UPDATE_EVENT,
  SESSION_UPDATE_EVENT,
} from '../utils/userManagementStorage';

// Mapping navigation icons
const NAV_ICONS = {
  dashboard: LayoutDashboard,
  loans: HandCoins,
  collection: WalletCards,
  vehicle: Car,
  ledger: ReceiptText,
  customers: UsersRound,
  investors: Landmark,
  reminders: BellRing,
  users: UserCog,
  settings: Settings,
};

const UserManagement = () => {
  // Navigation Tabs: 'users' | 'permissions'
  const [activeTab, setActiveTab] = useState('users');

  // Users Data
  const [users, setUsers] = useState(() => getUsers());
  const [currentUserSession, setCurrentUserSession] = useState(() => getCurrentUser());
  const [rolePermissions, setRolePermissions] = useState(() => getRolePermissions());

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedUserForView, setSelectedUserForView] = useState(null);
  const [isEditingUser, setIsEditingUser] = useState(false);

  // Success Notification Toast
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Listen to Storage Updates
  useEffect(() => {
    const handleUsersUpdate = (e) => setUsers(e.detail || getUsers());
    const handlePermUpdate = (e) => setRolePermissions(e.detail || getRolePermissions());
    const handleSessionUpdate = (e) => setCurrentUserSession(e.detail || getCurrentUser());

    window.addEventListener(USER_UPDATE_EVENT, handleUsersUpdate);
    window.addEventListener(PERMISSION_UPDATE_EVENT, handlePermUpdate);
    window.addEventListener(SESSION_UPDATE_EVENT, handleSessionUpdate);
    window.addEventListener('storage', () => {
      setUsers(getUsers());
      setRolePermissions(getRolePermissions());
      setCurrentUserSession(getCurrentUser());
    });

    return () => {
      window.removeEventListener(USER_UPDATE_EVENT, handleUsersUpdate);
      window.removeEventListener(PERMISSION_UPDATE_EVENT, handlePermUpdate);
      window.removeEventListener(SESSION_UPDATE_EVENT, handleSessionUpdate);
    };
  }, []);

  // Filtered Users List (Guaranteed unique records)
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = (u.name || '').toLowerCase().includes(q);
        const matchesPhone = String(u.phone || '').replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''));
        const matchesAddress = (u.address || '').toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesAddress) return false;
      }

      // 2. Role Filter
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;

      // 3. Status Filter (Safe handling of missing or undefined status values)
      if (statusFilter !== 'ALL') {
        const uStatus = String(u.status || 'Active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
        if (uStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  // Handle Switch User (for testing staff permissions vs admin)
  const handleSwitchSession = (user) => {
    setCurrentUser(user);
    showToast(`Switched active session to: ${user.name} (${user.role})`, 'info');
  };

  return (
    <div className="flex-1 min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium ${
              toastMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-100'
                : toastMessage.type === 'info'
                  ? 'bg-blue-50 text-blue-800 border-blue-200 shadow-blue-100'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100'
            }`}>
              {toastMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              )}
              <span>{toastMessage.message}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="ml-2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#006B52] text-white flex items-center justify-center shadow-xs">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  Manage staff accounts, credentials, and role-based navigation permissions.
                </p>
              </div>
            </div>
          </div>

          {/* Active Session Indicator & Switcher */}
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
            <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              {currentUserSession?.name ? currentUserSession.name[0].toUpperCase() : 'A'}
            </div>
            <div className="min-w-0 pr-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-800 truncate max-w-[120px]">
                  {currentUserSession?.name || 'Admin'}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                  currentUserSession?.role === 'Admin'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {currentUserSession?.role || 'Admin'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block leading-none mt-0.5">Active Session</span>
            </div>
          </div>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'border-[#006B52] text-[#006B52]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Users</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'users' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {users.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'permissions'
                ? 'border-[#006B52] text-[#006B52]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Roles & Permissions</span>
          </button>
        </div>

        {/* Tab 1: Users List */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            
            {/* Action Bar: Search, Filters, and Create User Button */}
            <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2 flex-wrap min-w-0">
                {/* Search Input */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, phone, or address..."
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52] transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Role Filter */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                >
                  <option value="ALL">All Roles</option>
                  <option value="Admin">Admin</option>
                  <option value="Staff">Staff</option>
                </select>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                >
                  <option value="ALL">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              {/* Create User Button */}
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#006B52] hover:bg-[#005344] active:scale-98 text-white text-xs sm:text-sm font-bold shadow-xs transition-all shrink-0 cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                <span>Create User</span>
              </button>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-4 sm:px-6">Name</th>
                      <th className="py-3.5 px-4 sm:px-6">Phone Number</th>
                      <th className="py-3.5 px-4 sm:px-6">Role</th>
                      <th className="py-3.5 px-4 sm:px-6">Status</th>
                      <th className="py-3.5 px-4 sm:px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="py-12 px-6 text-center text-slate-400">
                          <Users className="h-10 w-10 mx-auto text-slate-300 mb-2" />
                          <p className="text-sm font-semibold text-slate-600">No users found</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {searchQuery || roleFilter !== 'ALL' || statusFilter !== 'ALL'
                              ? 'Try adjusting your search query or filters'
                              : 'Click "+ Create User" above to add a staff account'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((user) => {
                        const effectiveStatus = String(user.status || 'Active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
                        return (
                          <tr
                            key={user.id}
                            className="hover:bg-slate-50/60 transition-colors group"
                          >
                            {/* Name & Details */}
                            <td className="py-4 px-4 sm:px-6">
                              <div className="flex items-center gap-3">
                                <div className={`h-9 w-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${
                                  user.role === 'Admin'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}>
                                  {user.name ? user.name[0].toUpperCase() : 'U'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 group-hover:text-[#006B52] transition-colors truncate">
                                      {user.name}
                                    </span>
                                    {user.isPrimaryAdmin && (
                                      <span className="text-[10px] font-extrabold px-2 py-0.2 rounded-md bg-purple-50 text-purple-700 border border-purple-200 shrink-0">
                                        Primary Admin
                                      </span>
                                    )}
                                    {currentUserSession?.id === user.id && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  {user.address && (
                                    <div className="text-xs text-slate-400 truncate max-w-[240px] mt-0.5">
                                      {user.address}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Phone Number */}
                            <td className="py-4 px-4 sm:px-6">
                              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                                <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>{user.phone}</span>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="py-4 px-4 sm:px-6">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                user.role === 'Admin'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {user.role === 'Admin' ? (
                                  <Shield className="h-3 w-3 text-purple-600" />
                                ) : (
                                  <UserRound className="h-3 w-3 text-blue-600" />
                                )}
                                <span>{user.role}</span>
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-4 px-4 sm:px-6">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.8 rounded-full text-xs font-bold border ${
                                effectiveStatus === 'Active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  effectiveStatus === 'Active' ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'
                                }`} />
                                <span>{effectiveStatus}</span>
                              </span>
                            </td>

                            {/* Action: View Details Button */}
                            <td className="py-4 px-4 sm:px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {/* View Details Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUserForView(user);
                                    setIsEditingUser(false);
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 active:scale-95 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
                                >
                                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                                  <span>View</span>
                                </button>

                                {/* Simulate Login / Switch Account Button */}
                                {currentUserSession?.id !== user.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleSwitchSession(user)}
                                    title={`Switch active session to ${user.name}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 text-[11px] font-semibold text-slate-500 transition-all cursor-pointer"
                                  >
                                    <span>Switch</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer info */}
              <div className="p-3.5 sm:p-4 bg-slate-50/60 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> unique account{users.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-slate-400">
                  MotoLend Access Control Engine
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Roles & Permissions Tab */}
        {activeTab === 'permissions' && (
          <RolesPermissionsTab
            rolePermissions={rolePermissions}
            onPermissionsSaved={(newPerms) => {
              setRolePermissions(newPerms);
              showToast('Role navigation permissions updated successfully!');
            }}
          />
        )}

      </div>

      {/* Create User Modal (No Permissions Section, No Username) */}
      {isCreateModalOpen && (
        <CreateUserModal
          onClose={() => setIsCreateModalOpen(false)}
          onUserCreated={(newUser) => {
            setIsCreateModalOpen(false);
            setUsers(getUsers());
            showToast(`User account created successfully for ${newUser.name}!`);
          }}
        />
      )}

      {/* View & Edit User Modal */}
      {selectedUserForView && (
        <UserDetailModal
          user={selectedUserForView}
          isEditing={isEditingUser}
          setIsEditing={setIsEditingUser}
          rolePermissions={rolePermissions}
          onClose={() => {
            setSelectedUserForView(null);
            setIsEditingUser(false);
          }}
          onUserUpdated={(updated) => {
            setSelectedUserForView(updated);
            setIsEditingUser(false);
            setUsers(getUsers());
            showToast(`Account details updated for ${updated.name}`);
          }}
        />
      )}
    </div>
  );
};

/**
 * Roles & Permissions Matrix Tab Component (Redesigned with refined MotoLend styling)
 */
const RolesPermissionsTab = ({ rolePermissions, onPermissionsSaved }) => {
  const [staffPerms, setStaffPerms] = useState(() => ({ ...rolePermissions.Staff }));
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Group navigation items by section
  const groupedItems = useMemo(() => {
    const groups = { Main: [], Modules: [], Notifications: [], User: [] };
    NAVIGATION_ITEMS.forEach((item) => {
      const s = item.section || 'Modules';
      if (!groups[s]) groups[s] = [];
      groups[s].push(item);
    });
    return groups;
  }, []);

  const enabledStaffCount = useMemo(() => {
    return NAVIGATION_ITEMS.filter((item) => Boolean(staffPerms[item.id])).length;
  }, [staffPerms]);

  const handleToggleStaffPerm = (itemId) => {
    setStaffPerms((prev) => {
      const next = { ...prev, [itemId]: !prev[itemId] };
      setHasChanges(true);
      return next;
    });
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      saveRolePermissions({ Staff: staffPerms });
      setIsSaving(false);
      setHasChanges(false);
      onPermissionsSaved({
        Admin: NAVIGATION_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: true }), {}),
        Staff: staffPerms,
      });
    }, 200);
  };

  const handleReset = () => {
    resetRolePermissions();
    const defaults = getRolePermissions();
    setStaffPerms({ ...defaults.Staff });
    setHasChanges(false);
    onPermissionsSaved(defaults);
  };

  return (
    <div className="space-y-5">
      {/* Header Section: Title, Description, Compact Visual Indicators, and Save Actions */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#006B52]"></span>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Roles & Permissions</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl leading-relaxed">
              Configure system navigation access and page visibility for Staff and Administrator roles. Admin retains full system access by design.
            </p>
          </div>

          {/* Save & Reset Actions */}
          <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs active:scale-95"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Reset to Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer active:scale-95 ${
                hasChanges
                  ? 'bg-[#006B52] hover:bg-[#005344] text-white ring-2 ring-[#006B52]/30 animate-pulse'
                  : 'bg-[#006B52] hover:bg-[#005344] text-white'
              }`}
            >
              {isSaving ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Compact Visual Indicators for Admin & Staff Roles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
          {/* Admin Role Indicator */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-50/60 border border-purple-200/80 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">Administrator Role</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">
                    Admin
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium block truncate mt-0.5">
                  Unrestricted access across all system pages
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                <Check className="h-3 w-3" />
                10 / 10 Allowed
              </span>
            </div>
          </div>

          {/* Staff Role Indicator */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900">Staff Member Role</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Staff
                  </span>
                </div>
                <span className="text-xs text-slate-500 font-medium block truncate mt-0.5">
                  Controlled access via the permission toggles below
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                enabledStaffCount > 0
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {enabledStaffCount} / 10 Allowed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Permission Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4 sm:px-6 w-[45%]">Application Navigation Item</th>
                <th className="py-3 px-4 sm:px-6 w-[15%]">Section</th>
                <th className="py-3 px-4 sm:px-6 text-center w-[20%]">
                  <div className="inline-flex items-center gap-1.5 text-purple-900 font-bold">
                    <Shield className="h-3.5 w-3.5 text-purple-600" />
                    <span>Admin</span>
                  </div>
                </th>
                <th className="py-3 px-4 sm:px-6 text-center w-[20%]">
                  <div className="inline-flex items-center gap-1.5 text-[#006B52] font-bold">
                    <UserRound className="h-3.5 w-3.5 text-[#006B52]" />
                    <span>Staff</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {Object.entries(groupedItems).map(([sectionName, items]) => (
                <React.Fragment key={sectionName}>
                  {/* Category Section Header Row */}
                  <tr className="bg-slate-50/80 border-y border-slate-200/60">
                    <td colSpan="4" className="py-2 px-4 sm:px-6 text-[10px] font-extrabold text-slate-600 uppercase tracking-widest">
                      {sectionName} Section
                    </td>
                  </tr>

                  {items.map((item, idx) => {
                    const IconComp = NAV_ICONS[item.id] || LayoutDashboard;
                    const isStaffAllowed = Boolean(staffPerms[item.id]);

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                        } hover:bg-emerald-50/20`}
                      >
                        {/* Page Name, Path, & Description */}
                        <td className="py-3 px-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200/80">
                              <IconComp className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 leading-tight">
                                  {item.name}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                  {item.path}
                                </span>
                              </div>
                              <span className="text-xs text-slate-400 block mt-0.5 truncate">
                                {item.description}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Section Tag */}
                        <td className="py-3 px-4 sm:px-6">
                          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.8 rounded-md border border-slate-200/60">
                            {item.section}
                          </span>
                        </td>

                        {/* Admin Column: Clean single full-access indicator */}
                        <td className="py-3 px-4 sm:px-6 text-center">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 bg-purple-50/80 border border-purple-200/80 px-2.5 py-1 rounded-md">
                            <Check className="h-3.5 w-3.5 text-purple-600 stroke-[2.5]" />
                            <span>Full Access</span>
                          </span>
                        </td>

                        {/* Staff Column: Interactive, refined toggle button */}
                        <td className="py-3 px-4 sm:px-6 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStaffPerm(item.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-2xs ${
                              isStaffAllowed
                                ? 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700'
                                : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                            }`}
                          >
                            {isStaffAllowed ? (
                              <>
                                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                <span>Allowed</span>
                              </>
                            ) : (
                              <>
                                <Lock className="h-3 w-3 text-slate-400" />
                                <span>Restricted</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Note Footer */}
        <div className="p-3.5 sm:p-4 bg-emerald-50/30 border-t border-emerald-100 flex items-center gap-2 text-xs text-emerald-900">
          <ShieldAlert className="h-4 w-4 text-emerald-700 shrink-0" />
          <span>
            Staff navigation permissions apply instantly across the sidebar menu and route access URLs.
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * View & Edit User Details Modal
 * Supports seamless editing for both Active and Inactive users without username
 */
const UserDetailModal = ({ user, isEditing, setIsEditing, rolePermissions, onClose, onUserUpdated }) => {
  const [localIsEditing, setLocalIsEditing] = useState(Boolean(isEditing));

  const getCleanPhone = (u) => {
    const raw = String(u?.phone || '').replace(/[\s\-\+]/g, '');
    return raw.length > 10 ? raw.slice(-10) : raw;
  };

  const getCleanStatus = (u) => {
    return String(u?.status || 'Active').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
  };

  const [formData, setFormData] = useState(() => ({
    name: user?.name || '',
    phone: getCleanPhone(user),
    address: user?.address || '',
    role: user?.role || 'Staff',
    status: getCleanStatus(user),
    password: '',
    confirmPassword: '',
  }));

  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Synchronize editing state from props
  useEffect(() => {
    setLocalIsEditing(Boolean(isEditing));
  }, [isEditing]);

  // Synchronize form data when user prop changes
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: getCleanPhone(user),
        address: user.address || '',
        role: user.role || 'Staff',
        status: getCleanStatus(user),
        password: '',
        confirmPassword: '',
      });
      setValidationError('');
    }
  }, [user]);

  const startEditing = () => {
    setFormData({
      name: user?.name || '',
      phone: getCleanPhone(user),
      address: user?.address || '',
      role: user?.role || 'Staff',
      status: getCleanStatus(user),
      password: '',
      confirmPassword: '',
    });
    setLocalIsEditing(true);
    setIsEditing?.(true);
    setValidationError('');
  };

  const stopEditing = () => {
    setFormData({
      name: user?.name || '',
      phone: getCleanPhone(user),
      address: user?.address || '',
      role: user?.role || 'Staff',
      status: getCleanStatus(user),
      password: '',
      confirmPassword: '',
    });
    setLocalIsEditing(false);
    setIsEditing?.(false);
    setValidationError('');
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }
    if (isSubmitting) return;
    setValidationError('');

    if (!formData.name || !formData.name.trim()) {
      setValidationError('Full Name is required.');
      return;
    }

    const cleanPhone = getCleanPhone(formData);
    if (!cleanPhone || !/^\d{10}$/.test(cleanPhone)) {
      setValidationError('Please enter a valid 10-digit registered mobile number.');
      return;
    }

    if (formData.password) {
      if (formData.password.length < 6) {
        setValidationError('Password must be at least 6 characters long.');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setValidationError('New password and confirm password do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const updates = {
        name: formData.name.trim(),
        phone: cleanPhone,
        address: (formData.address || '').trim(),
        role: formData.role || 'Staff',
        status: formData.status === 'Inactive' ? 'Inactive' : 'Active',
      };

      if (formData.password) {
        updates.password = formData.password;
      }

      const updated = await updateUser(user.id || user._id || user.phone, updates);
      setIsSubmitting(false);
      setLocalIsEditing(false);
      setIsEditing?.(false);
      onUserUpdated(updated);
    } catch (err) {
      setIsSubmitting(false);
      setValidationError(err.message || 'Failed to update user account.');
    }
  };

  const currentStatus = String(user?.status || 'Active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
              user.role === 'Admin'
                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {user.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                {localIsEditing ? 'Edit User Account' : user.name}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {localIsEditing ? 'Update profile information and account status' : `${user.role} Profile Details`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        {!localIsEditing ? (
          /* VIEW MODE */
          <>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Full Name</span>
                  <p className="text-sm font-bold text-slate-900 mt-1 truncate">{user.name}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Phone Number</span>
                  <p className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <span>{user.phone}</span>
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Role & Status</span>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                      user.role === 'Admin'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {user.role}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                      currentStatus === 'Active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${currentStatus === 'Active' ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                      <span>{currentStatus}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Address</span>
                <p className="text-sm text-slate-800 font-medium mt-1 leading-relaxed">
                  {user.address || 'No registered address on file.'}
                </p>
              </div>

              {/* Navigation Permissions Note for Staff */}
              {user.role === 'Staff' && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-[#006B52] shrink-0 mt-0.5" />
                  <span>
                    Staff navigation permissions are managed centrally in the <strong>Roles & Permissions</strong> tab.
                  </span>
                </div>
              )}
            </div>

            {/* View Mode Footer */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={startEditing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#006B52] hover:bg-[#005344] active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Edit className="h-3.5 w-3.5" />
                <span>Edit User</span>
              </button>
            </div>
          </>
        ) : (
          /* EDIT MODE - Form encapsulates entire body and footer */
          <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {validationError && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  <span>{validationError}</span>
                </div>
              )}

              {user.isPrimaryAdmin && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-purple-600 shrink-0" />
                  <span>Primary Admin role and status are permanently locked to prevent accidental lockout.</span>
                </div>
              )}

              {/* Full Name & Phone Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Registered Phone Number *
                  </label>
                  <input
                    type="tel"
                    maxLength="10"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    placeholder="10-digit number"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                  />
                </div>
              </div>

              {/* Full Address */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Full Address
                </label>
                <textarea
                  rows="2"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter residential or office address"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                />
              </div>

              {/* Role & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Role
                  </label>
                  <select
                    disabled={user.isPrimaryAdmin}
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52] disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Account Status
                  </label>
                  <select
                    disabled={user.isPrimaryAdmin}
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52] disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Password Change Section */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                  Reset Password (Optional)
                </span>
                <p className="text-[11px] text-slate-500">
                  Leave blank if you do not want to alter the current password.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="New Password (min 6 chars)"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirm New Password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Mode Footer */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={stopEditing}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#006B52] hover:bg-[#005344] active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

/**
 * Create User Modal Component
 * Requirements:
 * - NO username field or username validation
 * - NO navigation permissions section or checkboxes inside this form
 */
const CreateUserModal = ({ onClose, onUserCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    role: 'Staff',
    status: 'Active',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    // Validations
    if (!formData.name.trim()) {
      setValidationError('Full Name is required.');
      return;
    }

    const cleanPhone = String(formData.phone || '').replace(/[\s-]/g, '');
    if (!/^\d{10}$/.test(cleanPhone)) {
      setValidationError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!formData.address.trim()) {
      setValidationError('Residential / Branch Address is required.');
      return;
    }

    if (!formData.password) {
      setValidationError('Password is required.');
      return;
    }

    if (formData.password.length < 6) {
      setValidationError('Password must be at least 6 characters.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setValidationError('Password and Confirm Password do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newUser = await createUser({
        name: formData.name.trim(),
        phone: cleanPhone,
        address: formData.address.trim(),
        role: formData.role,
        status: formData.status,
        password: formData.password,
      });

      setIsSubmitting(false);
      onUserCreated(newUser);
    } catch (err) {
      setIsSubmitting(false);
      setValidationError(err.message || 'Failed to create user account.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-200 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs">
              <UserPlus className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">Create User</h3>
              <p className="text-xs text-slate-500 font-medium">
                Register a new administrator or staff account
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {validationError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          <form id="create-user-form" onSubmit={handleSubmit} className="space-y-4">
            
            {/* Full Name & Phone Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Phone Number (10 digits) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength="10"
                    placeholder="9876543210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                    className="w-full pl-12 pr-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Full Address *
              </label>
              <textarea
                rows="2"
                required
                placeholder="Residential or office branch address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
              />
            </div>

            {/* Role & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                >
                  <option value="Staff">Staff</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Account Status *
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Min 6 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Confirm Password *
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#006B52]/20 focus:border-[#006B52]"
                />
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-user-form"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#006B52] hover:bg-[#005344] active:scale-95 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span>Creating User...</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                <span>Create User</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default UserManagement;
