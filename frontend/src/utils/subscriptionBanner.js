// What the renewal banner says, from /auth/me's tenant.subscription:
//   30–8 days left  "notice" (amber, can be hidden for the session)
//   7–0 days left   "urgent" (orange, always shown)
//   past the date   "expired" (red), only during the grace days
// null when there is nothing to show.

const SHOW_FROM_DAYS = 30
const URGENT_DAYS = 7

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const formatDay = (dateText) => {
  const [y, m, d] = String(dateText).split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export const bannerFor = (subscription, contact) => {
  const { daysLeft, validUntil, graceEndsOn, inGrace } = subscription || {}
  if (daysLeft === null || daysLeft === undefined || daysLeft > SHOW_FROM_DAYS) return null
  const renew = contact ? `Contact ${contact} to renew.` : 'Contact MotoLend support to renew.'

  if (daysLeft < 0) {
    if (!inGrace) return null
    return {
      tone: 'expired',
      message: `Your MotoLend subscription expired on ${formatDay(validUntil)}. Access will stop after ${formatDay(graceEndsOn)}. ${renew}`,
    }
  }
  if (daysLeft <= URGENT_DAYS) {
    const when = daysLeft === 0 ? 'today' : `in ${plural(daysLeft, 'day')} (${formatDay(validUntil)})`
    return { tone: 'urgent', message: `Your MotoLend subscription ends ${when}. Renew now to avoid losing access. ${renew}` }
  }
  return {
    tone: 'notice',
    dismissible: true,
    message: `Your MotoLend subscription ends on ${formatDay(validUntil)} (${plural(daysLeft, 'day')} left). ${renew}`,
  }
}
