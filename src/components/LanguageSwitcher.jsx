import { useTranslation } from 'react-i18next'

const languages = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'ta', label: 'தமிழ்', shortLabel: 'தமிழ்' },
]

const LanguageSwitcher = () => {
  const { i18n } = useTranslation()

  const changeLanguage = (event) => {
    const language = event.target.value
    i18n.changeLanguage(language)
    window.localStorage.setItem('app-language', language)
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="language-switcher" className="text-xs font-medium text-slate-500">
        {i18n.t('app.language')}
      </label>
      <select
        id="language-switcher"
        value={i18n.resolvedLanguage || i18n.language}
        onChange={changeLanguage}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
        aria-label={i18n.t('app.selectLanguage')}
      >
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.shortLabel} - {language.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default LanguageSwitcher
