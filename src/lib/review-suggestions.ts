export const ADMIN_EMAIL = 'rajukushwaharealme@gmail.com';
export const REVIEW_SUGGESTIONS_STORAGE_KEY = 'focusApp.reviewSuggestions.v1';
export const REVIEW_SUGGESTIONS_UPDATED_EVENT = 'review-suggestions-updated';

export type ReviewSuggestionsSettings = {
  todaySuggestion: string;
  weeklySuggestions: string[];
};

export const DEFAULT_REVIEW_SUGGESTIONS: ReviewSuggestionsSettings = {
  todaySuggestion: '',
  weeklySuggestions: []
};

export const normalizeReviewSuggestions = (value: any): ReviewSuggestionsSettings => ({
  todaySuggestion: typeof value?.todaySuggestion === 'string' ? value.todaySuggestion : '',
  weeklySuggestions: Array.isArray(value?.weeklySuggestions)
    ? value.weeklySuggestions.filter((item: any) => typeof item === 'string' && item.trim()).map((item: string) => item.trim())
    : []
});

export const readLocalReviewSuggestions = (): ReviewSuggestionsSettings => {
  if (typeof window === 'undefined') return DEFAULT_REVIEW_SUGGESTIONS;

  try {
    const raw = window.localStorage.getItem(REVIEW_SUGGESTIONS_STORAGE_KEY);
    return raw ? normalizeReviewSuggestions(JSON.parse(raw)) : DEFAULT_REVIEW_SUGGESTIONS;
  } catch (error) {
    console.error('Could not read review suggestions', error);
    return DEFAULT_REVIEW_SUGGESTIONS;
  }
};

export const saveLocalReviewSuggestions = (settings: ReviewSuggestionsSettings) => {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(REVIEW_SUGGESTIONS_STORAGE_KEY, JSON.stringify(normalizeReviewSuggestions(settings)));
  window.dispatchEvent(new CustomEvent(REVIEW_SUGGESTIONS_UPDATED_EVENT));
};
