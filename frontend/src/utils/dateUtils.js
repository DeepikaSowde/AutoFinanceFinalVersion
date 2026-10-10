export const isDateInRange = (dateStr, filterType, customStart, customEnd) => {
  if (filterType === 'All Time') return true;

  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filterType === 'Today') {
    return d >= today;
  }
  if (filterType === 'This Week') {
    const firstDay = new Date(today.setDate(today.getDate() - today.getDay()));
    return d >= firstDay;
  }
  if (filterType === 'This Month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (filterType === 'Last Month') {
    let lastMonth = now.getMonth() - 1;
    let year = now.getFullYear();
    if (lastMonth < 0) {
      lastMonth = 11;
      year -= 1;
    }
    return d.getMonth() === lastMonth && d.getFullYear() === year;
  }
  if (filterType === 'Custom Range') {
    if (customStart && new Date(customStart) > d) return false;
    if (customEnd) {
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      if (end < d) return false;
    }
    return true;
  }

  return true;
};
