import { useEffect, useState } from 'react'
import { AlertTriangle, Clock, X } from 'lucide-react'
import { apiGet } from '../services/api'
import { bannerFor } from '../utils/subscriptionBanner'

// Renewal reminder shown to every signed-in user (admin and staff) of a
// lender whose MotoLend subscription is ending or in its grace days. After
// the grace days the server refuses sign-in, so nothing shows here.

const RECHECK_MS = 30 * 60 * 1000
const DISMISS_KEY = 'auto_finance_renewal_hidden'

const readHidden = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || ''
  } catch {
    return ''
  }
}

const TONES = {
  notice: 'border-amber-200 bg-amber-50 text-amber-900',
  urgent: 'border-orange-300 bg-orange-50 text-orange-900',
  expired: 'border-red-300 bg-red-50 text-red-900',
}

const SubscriptionBanner = () => {
  const [me, setMe] = useState(null)
  const [hidden, setHidden] = useState(readHidden)

  useEffect(() => {
    let alive = true
    const load = () =>
      apiGet('/auth/me')
        .then((data) => alive && setMe(data))
        .catch(() => {}) // the banner is a reminder; never break the page over it
    load()
    const timer = setInterval(load, RECHECK_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const subscription = me?.tenant?.subscription
  const banner = bannerFor(subscription, me?.supportContact)
  // Hiding lasts for this session and only for the date it was hidden at,
  // so after a renewal the next reminder shows again.
  if (!banner || (banner.dismissible && hidden === subscription.validUntil)) return null

  const hide = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, subscription.validUntil)
    } catch {
      // hidden for this page view only
    }
    setHidden(subscription.validUntil)
  }

  const Icon = banner.tone === 'notice' ? Clock : AlertTriangle

  return (
    <div role={banner.tone === 'notice' ? 'status' : 'alert'} className={`flex items-start gap-3 border-b px-4 py-2.5 text-sm sm:px-6 ${TONES[banner.tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 font-medium">{banner.message}</p>
      {banner.dismissible && (
        <button type="button" onClick={hide} className="rounded p-0.5 hover:bg-amber-100" aria-label="Hide this reminder">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export default SubscriptionBanner
