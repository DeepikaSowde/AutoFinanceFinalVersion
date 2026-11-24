// Name search: every word typed must be the START of a word in the name,
// in any order, ignoring case and extra spaces/dots. So "uma" finds "Uma"
// and "Uma Devi" but not "Arun Kumar" (whose "kumar" only contains "uma"),
// "kumar" still finds every Kumar, and "arun k" finds "Arun Kumar".

const words = (value) =>
  String(value ?? '')
    .toLowerCase()
    .split(/[\s.,'’-]+/)
    .filter(Boolean)

export const nameMatches = (name, query) => {
  const wanted = words(query)
  if (!wanted.length) return true
  const have = words(name)
  return wanted.every((w) => have.some((h) => h.startsWith(w)))
}
