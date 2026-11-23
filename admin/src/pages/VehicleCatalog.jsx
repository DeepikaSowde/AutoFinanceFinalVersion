import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Zap } from 'lucide-react'

import { api } from '../api'
import { Alert, Badge, Button, Card, PageHeader, Table, Td, Th } from '../components/ui'
import { formatDate } from '../format'
import { inputClass } from '../styles'
import { useLoad } from '../useLoad'

// The master vehicle list (Category -> Subcategory -> Brand -> Model) every
// lender's New Loan form offers, and the models lenders added for themselves.
// Nothing is deleted: entries are switched off. Renaming never changes loans
// already saved (they keep their text).

const checkboxClass = 'h-4 w-4 rounded border-slate-300 accent-teal-700'

const OffBadge = ({ active }) => (active ? null : <Badge tone="suspended">Off</Badge>)

// Run an API call with busy / error state; returns true when it worked.
const useSaving = () => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (call) => {
    setBusy(true)
    setError('')
    try {
      await call()
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

/* ---------- a name with an on/off switch, edited in place ---------- */

function EditableName({ id, name, active, count, onSave, label }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [on, setOn] = useState(active)
  const { busy, error, run } = useSaving()

  const save = async (event) => {
    event.preventDefault()
    const changes = {}
    if (value.trim() !== name) changes.name = value.trim()
    if (on !== active) changes.active = on
    if (!Object.keys(changes).length) return setEditing(false)
    if (await run(() => onSave(changes))) setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-800">
          <span className={`truncate ${active ? '' : 'text-slate-400 line-through'}`}>{name}</span>
          <OffBadge active={active} />
          {count !== undefined && <span className="text-xs text-slate-500">{count}</span>}
        </span>
        <button
          type="button"
          onClick={() => { setValue(name); setOn(active); setEditing(true) }}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label={`Edit ${label} ${name}`}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-2 rounded-lg bg-slate-50 p-2.5">
      <input id={`${id}-name`} aria-label={`${label} name`} required maxLength={80} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className={checkboxClass} />
        Shown to lenders
      </label>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy} className="px-3 py-1.5">Save</Button>
        <Button variant="secondary" className="px-3 py-1.5" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </form>
  )
}

function AddName({ label, placeholder, onAdd }) {
  const [value, setValue] = useState('')
  const { busy, error, run } = useSaving()
  const add = async (event) => {
    event.preventDefault()
    if (await run(() => onAdd(value.trim()))) setValue('')
  }
  return (
    <form onSubmit={add} className="space-y-2 pt-2">
      <div className="flex gap-2">
        <input aria-label={label} required maxLength={80} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={inputClass} />
        <Button type="submit" busy={busy} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  )
}

/* ---------- add / edit a model ---------- */

function ModelForm({ data, category, model, onDone, onCancel }) {
  const editing = Boolean(model)
  const [makeId, setMakeId] = useState(model ? String(model.makeId) : '')
  const [categoryId, setCategoryId] = useState(String(model?.categoryId ?? category.id))
  const [subcategoryId, setSubcategoryId] = useState(model?.subcategoryId ? String(model.subcategoryId) : '')
  const [name, setName] = useState(model?.name || '')
  const [isEv, setIsEv] = useState(model?.isEv || false)
  const [discontinued, setDiscontinued] = useState(model?.discontinued || false)
  const [active, setActive] = useState(model ? model.active : true)
  const { busy, error, run } = useSaving()

  const targetCategory = data.categories.find((item) => String(item.id) === categoryId) || category
  const brands = data.makes.filter((make) => make.active || String(make.id) === makeId)

  const save = async (event) => {
    event.preventDefault()
    const body = {
      makeId: Number(makeId),
      categoryId: Number(categoryId),
      subcategoryId: subcategoryId ? Number(subcategoryId) : null,
      name: name.trim(),
      isEv,
      discontinued,
      ...(editing ? { active } : {}),
    }
    const ok = await run(() => (editing ? api.patch(`/vehicle-catalog/models/${model.id}`, body) : api.post('/vehicle-catalog/models', body)))
    if (ok) onDone()
  }

  const prefix = editing ? `model-${model.id}` : 'new-model'

  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <p className="text-sm font-semibold text-slate-900">{editing ? `Edit ${model.name}` : `New ${category.name} model`}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-700" htmlFor={`${prefix}-brand`}>
          <span>Brand</span>
          <select id={`${prefix}-brand`} required value={makeId} onChange={(e) => setMakeId(e.target.value)} className={inputClass}>
            <option value="">Select brand</option>
            {brands.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-slate-700" htmlFor={`${prefix}-name`}>
          <span>Model name</span>
          <input id={`${prefix}-name`} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Destini 125" />
        </label>
        {editing && (
          <label className="space-y-1 text-sm font-medium text-slate-700" htmlFor={`${prefix}-category`}>
            <span>Category</span>
            <select id={`${prefix}-category`} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId('') }} className={inputClass}>
              {data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <label className="space-y-1 text-sm font-medium text-slate-700" htmlFor={`${prefix}-sub`}>
          <span>Subcategory</span>
          <select id={`${prefix}-sub`} value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} className={inputClass}>
            <option value="">None</option>
            {targetCategory.subcategories
              .filter((sub) => sub.active || String(sub.id) === subcategoryId)
              .map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isEv} onChange={(e) => setIsEv(e.target.checked)} className={checkboxClass} /> Electric
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={discontinued} onChange={(e) => setDiscontinued(e.target.checked)} className={checkboxClass} /> Discontinued (still financed used)
        </label>
        {editing && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className={checkboxClass} /> Shown to lenders
          </label>
        )}
      </div>
      {editing && model.name !== name.trim() && name.trim() && (
        <p className="text-xs text-slate-500">Loans already saved keep the old name.</p>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" busy={busy}>{editing ? 'Save model' : 'Add model'}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

/* ---------- master list ---------- */

function MasterList({ data, reload }) {
  const [categoryId, setCategoryId] = useState(data.categories[0]?.id ?? null)
  const [brandFilter, setBrandFilter] = useState('')
  const [subFilter, setSubFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showOff, setShowOff] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const category = data.categories.find((item) => item.id === categoryId) || data.categories[0]
  const makeName = useMemo(() => Object.fromEntries(data.makes.map((make) => [make.id, make])), [data.makes])
  const subName = useMemo(
    () => Object.fromEntries(data.categories.flatMap((item) => item.subcategories).map((sub) => [sub.id, sub.name])),
    [data.categories]
  )

  if (!category) return <p className="text-sm text-slate-500">No categories yet.</p>

  const inCategory = data.models.filter((model) => model.categoryId === category.id)
  const brandsInCategory = [...new Set(inCategory.map((model) => model.makeId))]
    .map((id) => makeName[id])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name))
  const needle = search.trim().toLowerCase()
  const shown = inCategory
    .filter((model) => !brandFilter || String(model.makeId) === brandFilter)
    .filter((model) => !subFilter || String(model.subcategoryId ?? '') === subFilter)
    .filter((model) => showOff || model.active)
    .filter((model) => !needle || `${makeName[model.makeId]?.name} ${model.name}`.toLowerCase().includes(needle))
    .sort((a, b) => (makeName[a.makeId]?.name || '').localeCompare(makeName[b.makeId]?.name || '') || a.name.localeCompare(b.name))

  const pickCategory = (id) => {
    setCategoryId(id)
    setBrandFilter('')
    setSubFilter('')
    setAdding(false)
    setEditingId(null)
  }

  const done = () => {
    setAdding(false)
    setEditingId(null)
    reload()
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Categories">
            <ul className="space-y-1">
              {data.categories.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pickCategory(item.id)}
                    aria-pressed={item.id === category.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      item.id === category.id ? 'bg-teal-800 text-white' : 'text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`truncate font-medium ${item.active ? '' : 'line-through opacity-70'}`}>{item.name}</span>
                    <span className="shrink-0 text-xs tabular-nums opacity-80">{item.active ? item.modelCount : 'Off'}</span>
                  </button>
                </li>
              ))}
            </ul>
            <AddName label="New category" placeholder="e.g. Agricultural" onAdd={async (name) => { await api.post('/vehicle-catalog/categories', { name }); reload() }} />
          </Card>

          <Card title={`${category.name} settings`}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Category</p>
            <EditableName
              key={`c-${category.id}-${category.name}-${category.active}`}
              id={`cat-${category.id}`}
              label="category"
              name={category.name}
              active={category.active}
              onSave={async (changes) => { await api.patch(`/vehicle-catalog/categories/${category.id}`, changes); reload() }}
            />
            <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Subcategories</p>
            <div className="divide-y divide-slate-100">
              {category.subcategories.map((sub) => (
                <EditableName
                  key={`s-${sub.id}-${sub.name}-${sub.active}`}
                  id={`sub-${sub.id}`}
                  label="subcategory"
                  name={sub.name}
                  active={sub.active}
                  count={sub.modelCount}
                  onSave={async (changes) => { await api.patch(`/vehicle-catalog/subcategories/${sub.id}`, changes); reload() }}
                />
              ))}
              {!category.subcategories.length && <p className="py-1.5 text-sm text-slate-500">None yet.</p>}
            </div>
            <AddName
              label={`New ${category.name} subcategory`}
              placeholder="e.g. Tractor"
              onAdd={async (name) => { await api.post('/vehicle-catalog/subcategories', { categoryId: category.id, name }); reload() }}
            />
          </Card>
        </div>

        <Card
          title={`${category.name} models · ${inCategory.filter((model) => model.active).length} shown to lenders`}
          action={
            <Button onClick={() => { setAdding(true); setEditingId(null) }} disabled={adding}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add model
            </Button>
          }
        >
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select aria-label="Filter by brand" value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className={inputClass}>
              <option value="">All brands</option>
              {brandsInCategory.map((make) => <option key={make.id} value={make.id}>{make.name}</option>)}
            </select>
            <select aria-label="Filter by subcategory" value={subFilter} onChange={(e) => setSubFilter(e.target.value)} className={inputClass}>
              <option value="">All subcategories</option>
              {category.subcategories.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </select>
            <input aria-label="Search models" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className={inputClass} />
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} className={checkboxClass} />
            Show switched-off models
          </label>

          {adding && (
            <div className="mb-4">
              <ModelForm data={data} category={category} onDone={done} onCancel={() => setAdding(false)} />
            </div>
          )}

          <Table minWidth={640}>
            <thead>
              <tr>
                <Th>Model</Th>
                <Th>Brand</Th>
                <Th>Subcategory</Th>
                <Th>Status</Th>
                <Th className="text-right">Edit</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((model) =>
                editingId === model.id ? (
                  <tr key={model.id}>
                    <Td colSpan={5}>
                      <ModelForm data={data} category={category} model={model} onDone={done} onCancel={() => setEditingId(null)} />
                    </Td>
                  </tr>
                ) : (
                  <tr key={model.id} className={model.active ? '' : 'bg-slate-50'}>
                    <Td className={`font-medium ${model.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {model.name}
                        {model.isEv && <Zap className="h-3.5 w-3.5 text-amber-500" aria-label="Electric" />}
                      </span>
                    </Td>
                    <Td className="text-slate-700">{makeName[model.makeId]?.name || '—'}</Td>
                    <Td className="text-slate-600">{model.subcategoryId ? subName[model.subcategoryId] : '—'}</Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {!model.active && <Badge tone="suspended">Off</Badge>}
                        {model.discontinued && <Badge tone="expired">Discontinued</Badge>}
                        {model.active && !model.discontinued && <Badge tone="active">Shown</Badge>}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => { setEditingId(model.id); setAdding(false) }}
                        className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={`Edit ${model.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </Td>
                  </tr>
                )
              )}
              {!shown.length && (
                <tr><Td colSpan={5} className="py-8 text-center text-slate-500">No models match.</Td></tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title={`Brands · ${data.makes.length}`}>
        <p className="mb-3 text-sm text-slate-600">A brand appears in a category once it has a model there. Switching a brand off hides all its models.</p>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {data.makes.map((make) => (
            <div key={`${make.id}-${make.name}-${make.active}`} className="border-b border-slate-100">
              <EditableName
                id={`brand-${make.id}`}
                label="brand"
                name={make.name}
                active={make.active}
                count={make.modelCount}
                onSave={async (changes) => { await api.patch(`/vehicle-catalog/brands/${make.id}`, changes); reload() }}
              />
            </div>
          ))}
        </div>
        <div className="max-w-md">
          <AddName label="New brand" placeholder="e.g. Sonalika" onAdd={async (name) => { await api.post('/vehicle-catalog/brands', { name }); reload() }} />
        </div>
      </Card>
    </div>
  )
}

/* ---------- models lenders added ---------- */

function LenderAdded({ data, reload }) {
  const { error, setError, run } = useSaving()
  const [busyId, setBusyId] = useState(null)
  const [message, setMessage] = useState('')
  const categoryName = Object.fromEntries(data.categories.map((item) => [item.id, item.name]))
  const subName = Object.fromEntries(data.categories.flatMap((item) => item.subcategories).map((sub) => [sub.id, sub.name]))
  const models = data.lenderAdded.models

  const promote = async (model) => {
    const text = model.inMaster
      ? `${model.makeName} ${model.name} is already in the master list. Remove ${model.tenantName}'s own copy so they use the master entry?`
      : `Add ${model.makeName} ${model.name} to the master list? Every lender will see it, and ${model.tenantName}'s own copy is replaced by it.`
    if (!window.confirm(text)) return
    setBusyId(model.id)
    setMessage('')
    const ok = await run(() => api.post(`/vehicle-catalog/lender-models/${model.id}/promote`))
    setBusyId(null)
    if (ok) {
      setMessage(`${model.makeName} ${model.name} is now in the master list.`)
      reload()
    }
  }

  return (
    <Card title={`Models lenders added · ${models.length}`}>
      <p className="mb-4 text-sm text-slate-600">
        Each lender sees only its own additions. When several lenders add the same vehicle, add it to the master list once so every lender gets it.
      </p>
      {message && <div className="mb-4"><Alert tone="success" onClose={() => setMessage('')}>{message}</Alert></div>}
      {error && <div className="mb-4"><Alert onClose={() => setError('')}>{error}</Alert></div>}
      <Table minWidth={820}>
        <thead>
          <tr>
            <Th>Lender</Th>
            <Th>Brand</Th>
            <Th>Model</Th>
            <Th>Category</Th>
            <Th>Added</Th>
            <Th className="text-right">Action</Th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id}>
              <Td className="font-medium text-slate-900">{model.tenantName}</Td>
              <Td className="text-slate-700">
                <span className="flex flex-wrap items-center gap-1.5">
                  {model.makeName}
                  {model.makeIsLenders && <Badge>New brand</Badge>}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-slate-800">
                <span className="inline-flex items-center gap-1.5">
                  {model.name}
                  {model.isEv && <Zap className="h-3.5 w-3.5 text-amber-500" aria-label="Electric" />}
                </span>
              </Td>
              <Td className="text-slate-600">
                {categoryName[model.categoryId]}
                {model.subcategoryId ? ` · ${subName[model.subcategoryId]}` : ''}
              </Td>
              <Td className="whitespace-nowrap text-slate-600">{formatDate(model.createdAt)}{model.createdBy ? ` · ${model.createdBy}` : ''}</Td>
              <Td className="text-right">
                <Button variant={model.inMaster ? 'secondary' : 'primary'} busy={busyId === model.id} onClick={() => promote(model)} className="whitespace-nowrap">
                  {model.inMaster ? 'Use master entry' : (<><Check className="h-4 w-4" aria-hidden="true" /> Add to master list</>)}
                </Button>
              </Td>
            </tr>
          ))}
          {!models.length && (
            <tr><Td colSpan={6} className="py-8 text-center text-slate-500">No lender has added a model yet.</Td></tr>
          )}
        </tbody>
      </Table>
    </Card>
  )
}

export default function VehicleCatalog() {
  const catalog = useLoad(() => api.get('/vehicle-catalog'), 'vehicle-catalog')
  const [tab, setTab] = useState('master')
  const data = catalog.data
  const lenderCount = data?.lenderAdded.models.length ?? 0

  return (
    <>
      <PageHeader
        title="Vehicle Catalog"
        subtitle="The vehicle types, brands and models every lender's New Loan form offers. Lenders can switch entries off for their own staff and add models of their own."
      />

      <div role="tablist" aria-label="Catalog view" className="mb-6 flex flex-wrap gap-2">
        {[
          ['master', `Master list${data ? ` · ${data.models.length} models` : ''}`],
          ['lenders', `Added by lenders · ${lenderCount}`],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset transition-colors ${
              tab === key ? 'bg-teal-800 text-white ring-teal-800' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {catalog.error && <Alert>Could not load the vehicle catalog: {catalog.error}</Alert>}
      {!data && !catalog.error && <p className="text-sm text-slate-500">Loading…</p>}
      {data && tab === 'master' && <MasterList data={data} reload={catalog.reload} />}
      {data && tab === 'lenders' && <LenderAdded data={data} reload={catalog.reload} />}
    </>
  )
}
