// src/services/vehicleCatalogApi.js
//
// The vehicle catalog New Loan offers: Category -> Subcategory -> Brand ->
// Model (GET /api/settings/vehicle-catalog). The server already left out
// what this lender's admin switched off and added the lender's own
// brands/models. Loaded once per page load and shared.
//
// If the catalog cannot be loaded, the form falls back to the old fixed
// lists in Options.js so a loan can still be entered.

import { useEffect, useState } from 'react'
import { apiGet, getToken } from './api'
import { VEHICLE_TYPES, BRANDS, MODELS } from '../../Options'

export const OTHER = 'Other'

const fallbackCatalog = () => {
  const categories = VEHICLE_TYPES.map((name, index) => ({ id: -(index + 1), name, subcategories: [] }))
  const makes = BRANDS.filter((name) => name !== OTHER).map((name, index) => ({ id: -(index + 1), name, custom: false }))
  return { categories, makes, models: [], fallbackModels: MODELS.filter((name) => name !== OTHER), isFallback: true }
}

// The cache belongs to one sign-in, so another user (or lender) signing in
// on the same tab never sees the previous one's catalog.
let cached = null
let cachedFor = null
let pending = null

const currentCache = () => (cached && cachedFor === getToken() ? cached : null)

export const loadVehicleCatalog = () => {
  if (currentCache()) return Promise.resolve(cached)
  if (!pending) {
    const token = getToken()
    pending = apiGet('/settings/vehicle-catalog')
      .then((catalog) => {
        cached = { ...catalog, isFallback: false }
        cachedFor = token
        return cached
      })
      .catch((error) => {
        console.error('Vehicle catalog could not be loaded; using the fixed lists.', error)
        return fallbackCatalog()
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

// Forget the cached catalog (after the admin changes it in Settings).
export const clearVehicleCatalogCache = () => {
  cached = null
}

export const useVehicleCatalog = () => {
  const [catalog, setCatalog] = useState(currentCache)

  useEffect(() => {
    let alive = true
    if (!currentCache()) {
      loadVehicleCatalog().then((result) => {
        if (alive) setCatalog(result)
      })
    }
    return () => {
      alive = false
    }
  }, [])

  return catalog
}

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export const findByName = (list, name) => (list || []).find((item) => sameName(item.name, name)) || null

// The choices for each dropdown given what is already picked. Names are
// what get stored on the vehicle, matching the old free-text values.
export const catalogChoices = (catalog, { type, subcategory, brand }) => {
  if (!catalog) return { categories: [], subcategories: [], brands: [], models: [] }

  const category = findByName(catalog.categories, type)
  const sub = category ? findByName(category.subcategories, subcategory) : null
  const make = findByName(catalog.makes, brand)

  const inCategory = catalog.models.filter(
    (model) => (!category || model.categoryId === category.id) && (!sub || model.subcategoryId === sub.id)
  )

  const makeIds = new Set(inCategory.map((model) => model.makeId))
  const brands = catalog.makes.filter((item) => makeIds.has(item.id) || item.custom || catalog.isFallback)

  const models = catalog.isFallback
    ? (catalog.fallbackModels || []).map((name) => ({ name, label: name }))
    : make
      ? inCategory
          .filter((model) => model.makeId === make.id)
          .map((model) => ({
            ...model,
            label: model.discontinued ? `${model.name} (discontinued)` : model.name,
          }))
      : []

  return {
    categories: catalog.categories.map((item) => item.name),
    subcategories: category ? category.subcategories.map((item) => item.name) : [],
    brands: brands.map((item) => item.name),
    models,
  }
}

// The catalog entries behind a picked model (to fill subcategory / fuel).
export const findModel = (catalog, { type, brand, model }) => {
  if (!catalog || catalog.isFallback) return null
  const category = findByName(catalog.categories, type)
  const make = findByName(catalog.makes, brand)
  if (!category || !make) return null
  const found = catalog.models.find(
    (item) => item.categoryId === category.id && item.makeId === make.id && sameName(item.name, model)
  )
  if (!found) return null
  const sub = category.subcategories.find((item) => item.id === found.subcategoryId)
  return { ...found, subcategoryName: sub?.name || '' }
}
