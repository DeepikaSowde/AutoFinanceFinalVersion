import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Info,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../../services/api';
import { clearVehicleCatalogCache } from '../../services/vehicleCatalogApi';

// Settings -> Vehicle Catalog (admin). The master list comes from MotoLend;
// here the admin switches off what their company does not finance (their
// staff no longer see it in New Loan) and adds vehicles of their own.
// Every switch saves straight away. Loans already saved are not affected.

const NEW_BRAND = '__new__';

/* ---------- small pieces ---------- */

const Switch = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={(e) => {
      e.stopPropagation();
      onChange(!checked);
    }}
    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#006052] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? 'bg-[#006052]' : 'bg-slate-300'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

const inputCls =
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#006052] focus:outline-none focus:ring-1 focus:ring-[#006052]/30';

const EvMark = () => <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Electric" />;

/* ---------- add / edit one of the company's own models ---------- */

function OwnModelDialog({ catalog, initialCategoryId, model, onClose, onSaved }) {
  const editing = Boolean(model);
  const [categoryId, setCategoryId] = useState(String(model?.categoryId ?? initialCategoryId ?? ''));
  const [subcategoryId, setSubcategoryId] = useState(model?.subcategoryId ? String(model.subcategoryId) : '');
  const [makeId, setMakeId] = useState(model ? String(model.makeId) : '');
  const [brandName, setBrandName] = useState('');
  const [name, setName] = useState(model?.name || '');
  const [isEv, setIsEv] = useState(model?.isEv || false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const category = catalog.categories.find((item) => String(item.id) === categoryId);
  const brands = [...catalog.makes].sort((a, b) => a.name.localeCompare(b.name));

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = editing
        ? await apiPatch(`/settings/vehicle-catalog/models/${model.id}`, {
            name: name.trim(),
            subcategoryId: subcategoryId ? Number(subcategoryId) : null,
            isEv,
          })
        : await apiPost('/settings/vehicle-catalog/models', {
            categoryId: Number(categoryId),
            subcategoryId: subcategoryId ? Number(subcategoryId) : null,
            ...(makeId === NEW_BRAND ? { brandName: brandName.trim() } : { makeId: Number(makeId) }),
            name: name.trim(),
            isEv,
          });
      onSaved(updated, editing ? `${name.trim()} saved.` : `${name.trim()} added. Your staff can pick it in New Loan.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const makeName = catalog.makes.find((make) => make.id === model?.makeId)?.name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="own-model-title">
      <form onSubmit={save} className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="own-model-title" className="text-base font-bold text-slate-900">
            {editing ? `Edit ${makeName || ''} ${model.name}` : 'Add a model'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          {!editing && (
            <p className="text-xs text-slate-500">
              For a vehicle that is not in the list. Only your company sees it.
            </p>
          )}

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>Vehicle Type</span>
            <select
              required
              disabled={editing}
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSubcategoryId('');
              }}
              className={inputCls}
              aria-label="Vehicle Type"
            >
              <option value="">Select Vehicle Type</option>
              {catalog.categories.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>Subcategory</span>
            <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} className={inputCls} disabled={!category} aria-label="Subcategory">
              <option value="">None</option>
              {(category?.subcategories || []).map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </label>

          {!editing && (
            <label className="block space-y-1 text-xs font-medium text-slate-700">
              <span>Brand</span>
              <select required value={makeId} onChange={(e) => setMakeId(e.target.value)} className={inputCls} aria-label="Brand">
                <option value="">Select Brand</option>
                {brands.map((make) => (
                  <option key={make.id} value={make.id}>{make.name}</option>
                ))}
                <option value={NEW_BRAND}>+ New brand…</option>
              </select>
              {makeId === NEW_BRAND && (
                <input
                  required
                  maxLength={80}
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Type the brand name"
                  className={`${inputCls} mt-1.5`}
                  aria-label="New brand name"
                />
              )}
            </label>
          )}

          <label className="block space-y-1 text-xs font-medium text-slate-700">
            <span>Model</span>
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Destini 125"
              className={inputCls}
              aria-label="Model name"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isEv} onChange={(e) => setIsEv(e.target.checked)} className="h-4 w-4 accent-[#006052]" />
            Electric vehicle
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#006052] px-4 py-2 text-xs font-bold text-white hover:bg-[#004d42] disabled:opacity-60"
          >
            {busy ? 'Saving…' : editing ? 'Save' : 'Add model'}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- page ---------- */

const VehicleCatalogSettings = () => {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [openBrands, setOpenBrands] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null); // { model? }

  useEffect(() => {
    let active = true;
    apiGet('/settings/vehicle-catalog?all=1')
      .then((data) => {
        if (!active) return;
        setCatalog(data);
        setCategoryId((current) => current ?? data.categories[0]?.id ?? null);
      })
      .catch((err) => active && setLoadError(err.message));
    return () => {
      active = false;
    };
  }, []);

  const showToast = (text, tone = 'success') => {
    setToast({ text, tone });
    setTimeout(() => setToast((current) => (current?.text === text ? null : current)), 4000);
  };

  const applyUpdate = (updated, message) => {
    setCatalog(updated);
    clearVehicleCatalogCache();
    if (message) showToast(message);
  };

  const setHidden = async (items, message) => {
    setSaving(true);
    try {
      applyUpdate(await apiPut('/settings/vehicle-catalog/hidden', { items }), message);
    } catch (err) {
      showToast(`Could not save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const makeById = useMemo(() => Object.fromEntries((catalog?.makes || []).map((make) => [make.id, make])), [catalog]);

  if (loadError) {
    return (
      <div className="p-6 text-sm text-red-700">Could not load the vehicle catalog: {loadError}</div>
    );
  }
  if (!catalog) {
    return <div className="p-6 text-sm text-slate-500">Loading…</div>;
  }

  const category = catalog.categories.find((item) => item.id === categoryId) || catalog.categories[0];
  const modelsIn = (id) => catalog.models.filter((model) => model.categoryId === id);
  const inCategory = category ? modelsIn(category.id) : [];
  const needle = search.trim().toLowerCase();
  const matching = inCategory.filter(
    (model) => !needle || `${makeById[model.makeId]?.name || ''} ${model.name}`.toLowerCase().includes(needle)
  );
  const brandGroups = [...new Set(matching.map((model) => model.makeId))]
    .map((id) => ({
      make: makeById[id],
      models: matching.filter((model) => model.makeId === id),
      all: inCategory.filter((model) => model.makeId === id),
    }))
    .filter((group) => group.make)
    .sort((a, b) => a.make.name.localeCompare(b.make.name));
  const ownModels = catalog.models.filter((model) => model.custom);
  const subById = Object.fromEntries(catalog.categories.flatMap((item) => item.subcategories).map((sub) => [sub.id, sub]));
  const categoryName = Object.fromEntries(catalog.categories.map((item) => [item.id, item.name]));

  const toggleBrand = (group, on) => {
    const items = group.all
      .filter((model) => model.hiddenSelf === on)
      .map((model) => ({ kind: 'model', id: model.id, hidden: !on }));
    if (!items.length) return;
    setHidden(items, `${group.make.name} ${category.name} ${on ? 'switched on' : 'switched off'}.`);
  };

  const deleteOwn = async (model) => {
    const label = `${makeById[model.makeId]?.name || ''} ${model.name}`.trim();
    if (!window.confirm(`Remove ${label} from your list? Loans already saved with it keep their details.`)) return;
    setSaving(true);
    try {
      applyUpdate(await apiDelete(`/settings/vehicle-catalog/models/${model.id}`), `${label} removed.`);
    } catch (err) {
      showToast(`Could not remove: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50/60 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 font-sans">
      <div className="mb-3">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#006052] hover:text-[#004d42] transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Settings</span>
        </button>
      </div>

      <div className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200/80">
        <h1 className="page-title">Vehicle Catalog</h1>
        <button
          type="button"
          onClick={() => setDialog({})}
          className="inline-flex items-center gap-1.5 self-start md:self-center px-4 py-2 rounded-xl bg-[#006052] hover:bg-[#004d42] text-white text-xs font-bold shadow-xs cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Model</span>
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className={`mb-4 p-3.5 rounded-xl border flex items-center justify-between gap-3 shadow-2xs ${
            toast.tone === 'error' ? 'bg-red-50 border-red-200 text-red-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${toast.tone === 'error' ? 'text-red-600' : 'text-emerald-600'}`} />
            <span className="text-xs sm:text-sm font-semibold">{toast.text}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} className="text-xs font-bold px-2 py-0.5 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-5 p-3.5 rounded-xl bg-blue-50/70 border border-blue-100 text-xs text-blue-900 flex items-start gap-2.5 leading-relaxed">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          Switch off the vehicles your company does not finance. Your staff will not see them in New Loan. Changes are saved straight away, and loans already saved are not affected.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Categories */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden self-start">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Vehicle Types</h2>
          </div>
          <ul className="p-2 space-y-1">
            {catalog.categories.map((item) => {
              const models = modelsIn(item.id);
              const on = models.filter((model) => !model.hidden).length;
              const selected = item.id === category?.id;
              return (
                <li key={item.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { setCategoryId(item.id); setSearch(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCategoryId(item.id);
                      }
                    }}
                    aria-pressed={selected}
                    className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                      selected ? 'bg-emerald-50 ring-1 ring-[#006052]/30' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${item.hidden ? 'text-slate-400' : 'text-slate-900'}`}>{item.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.hidden ? 'Switched off' : `${on} of ${models.length} models on`}
                      </p>
                    </div>
                    <Switch
                      checked={!item.hidden}
                      disabled={saving}
                      label={`${item.name} shown in New Loan`}
                      onChange={(value) =>
                        setHidden([{ kind: 'category', id: item.id, hidden: !value }], `${item.name} ${value ? 'switched on' : 'switched off'}.`)
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Selected category */}
        {category && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">{category.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Switch a subcategory, a brand or a single model off or on.
              </p>
            </div>

            {category.hidden ? (
              <div className="p-5 text-sm text-slate-600">
                {category.name} is switched off, so your staff cannot choose it. Switch it on to manage its models.
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {category.subcategories.length > 0 && (
                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Subcategories</p>
                    <div className="flex flex-wrap gap-2">
                      {category.subcategories.map((sub) => (
                        <div key={sub.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5">
                          <span className={`text-xs font-semibold ${sub.hiddenSelf ? 'text-slate-400' : 'text-slate-700'}`}>{sub.name}</span>
                          <Switch
                            checked={!sub.hiddenSelf}
                            disabled={saving}
                            label={`${sub.name} shown in New Loan`}
                            onChange={(value) =>
                              setHidden([{ kind: 'subcategory', id: sub.id, hidden: !value }], `${sub.name} ${value ? 'switched on' : 'switched off'}.`)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Brands &amp; models</p>
                    <div className="relative sm:w-64">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search brand or model"
                        className={`${inputCls} pl-8`}
                        aria-label="Search brand or model"
                      />
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {brandGroups.map((group) => {
                      const onCount = group.all.filter((model) => !model.hidden).length;
                      const anyOn = group.all.some((model) => !model.hiddenSelf);
                      const open = Boolean(openBrands[group.make.id]) || Boolean(needle);
                      return (
                        <div key={group.make.id}>
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenBrands((current) => ({ ...current, [group.make.id]: !current[group.make.id] }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setOpenBrands((current) => ({ ...current, [group.make.id]: !current[group.make.id] }));
                              }
                            }}
                            aria-expanded={open}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                              <span className={`truncate text-sm font-semibold ${anyOn ? 'text-slate-900' : 'text-slate-400'}`}>{group.make.name}</span>
                              {group.make.custom && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">Your brand</span>
                              )}
                              <span className="text-[11px] text-slate-500">{onCount} of {group.all.length} on</span>
                            </div>
                            <Switch
                              checked={anyOn}
                              disabled={saving}
                              label={`${group.make.name} ${category.name} shown in New Loan`}
                              onChange={(value) => toggleBrand(group, value)}
                            />
                          </div>

                          {open && (
                            <ul className="grid grid-cols-1 gap-x-6 bg-slate-50/60 px-4 py-2 sm:grid-cols-2">
                              {group.models.map((model) => {
                                const blocked = model.hidden && !model.hiddenSelf;
                                return (
                                  <li key={model.id} className="flex items-center justify-between gap-2 py-1.5">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <span className={`truncate text-sm ${model.hidden ? 'text-slate-400' : 'text-slate-800'}`}>{model.name}</span>
                                      {model.isEv && <EvMark />}
                                      {model.discontinued && <span className="text-[10px] text-slate-400">(discontinued)</span>}
                                      {model.custom && <span className="text-[10px] font-semibold text-amber-700">Added by you</span>}
                                      {blocked && (
                                        <span className="text-[10px] text-slate-400">
                                          ({subById[model.subcategoryId]?.hiddenSelf ? `${subById[model.subcategoryId].name} off` : 'off'})
                                        </span>
                                      )}
                                    </span>
                                    <Switch
                                      checked={!model.hiddenSelf}
                                      disabled={saving}
                                      label={`${group.make.name} ${model.name} shown in New Loan`}
                                      onChange={(value) =>
                                        setHidden([{ kind: 'model', id: model.id, hidden: !value }], `${group.make.name} ${model.name} ${value ? 'switched on' : 'switched off'}.`)
                                      }
                                    />
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    {!brandGroups.length && (
                      <p className="px-4 py-6 text-center text-sm text-slate-500">
                        {needle ? 'No brand or model matches.' : 'No models in this vehicle type yet.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* The company's own models */}
      <div className="mt-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">Added by your company</h2>
          <p className="text-xs text-slate-500 mt-0.5">Vehicles you added that are not in the MotoLend list. Only your company sees them.</p>
        </div>
        {ownModels.length ? (
          <ul className="divide-y divide-slate-100">
            {ownModels.map((model) => (
              <li key={model.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                    {makeById[model.makeId]?.name} {model.name}
                    {model.isEv && <EvMark />}
                  </p>
                  <p className="text-xs text-slate-500">
                    {categoryName[model.categoryId]}
                    {model.subcategoryId ? ` · ${subById[model.subcategoryId]?.name || ''}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog({ model })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    aria-label={`Edit ${model.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => deleteOwn(model)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                    aria-label={`Remove ${model.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">
            Nothing added yet. Use <span className="font-semibold">Add Model</span> for a vehicle that is not in the list.
          </p>
        )}
      </div>

      {dialog && (
        <OwnModelDialog
          catalog={catalog}
          initialCategoryId={category?.id}
          model={dialog.model}
          onClose={() => setDialog(null)}
          onSaved={(updated, message) => {
            setDialog(null);
            applyUpdate(updated, message);
          }}
        />
      )}
    </div>
  );
};

export default VehicleCatalogSettings;
