const STORAGE_KEY = "customerOnboardingForm";

// Save complete onboarding form
export const saveCustomerOnboarding = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save customer onboarding data:", error);
  }
};

// Get saved onboarding form
export const getCustomerOnboarding = () => {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      return null;
    }

    return JSON.parse(savedData);
  } catch (error) {
    console.error("Failed to load customer onboarding data:", error);
    return null;
  }
};

// Clear onboarding form
export const clearCustomerOnboarding = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear customer onboarding data:", error);
  }
};