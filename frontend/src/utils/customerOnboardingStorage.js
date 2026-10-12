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
// Which server draft (if any) the form in this browser was saved as, so
// "Save Draft" updates it instead of creating a copy.
const DRAFT_ID_KEY = "customerOnboardingDraftId";

export const getOnboardingDraftId = () => {
  try {
    return localStorage.getItem(DRAFT_ID_KEY) || null;
  } catch {
    return null;
  }
};

export const setOnboardingDraftId = (draftId) => {
  try {
    if (draftId) {
      localStorage.setItem(DRAFT_ID_KEY, draftId);
    } else {
      localStorage.removeItem(DRAFT_ID_KEY);
    }
  } catch {
    // Storage unavailable: the next save simply creates a new draft.
  }
};
