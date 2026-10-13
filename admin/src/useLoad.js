import { useCallback, useEffect, useState } from 'react'

// Loads data with `load()` when `key` changes; `reload()` fetches again.
// Returns { data, error, loading, reload, setData }.
export const useLoad = (load, key) => {
  const [state, setState] = useState({ data: null, error: '', loading: true })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    load()
      .then((data) => active && setState({ data, error: '', loading: false }))
      .catch((error) => active && setState((current) => ({ ...current, error: error.message, loading: false })))
    return () => {
      active = false
    }
    // `load` is recreated each render; `key` says when the request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  const setData = useCallback((data) => setState((current) => ({ ...current, data })), [])

  return { ...state, reload, setData }
}
