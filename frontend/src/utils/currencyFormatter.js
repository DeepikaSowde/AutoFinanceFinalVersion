export const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '₹0';
  return `₹${Math.round(Number(value)).toLocaleString("en-IN")}`;
};

export const formatCompactCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '₹0';
  const num = Number(value);
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(1)}Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(1)}L`;
  }
  if (num >= 1000) {
    return `₹${(num / 1000).toFixed(1)}K`;
  }
  return `₹${num}`;
};
