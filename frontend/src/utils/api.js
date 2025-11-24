const rawBaseUrl = import.meta.env?.VITE_API_URL;

const apiBaseUrl = (() => {
  if (typeof rawBaseUrl === 'string') {
    const trimmed = rawBaseUrl.trim();
    if (trimmed.length > 0) {
      return trimmed.replace(/\/+$/, '');
    }
  }
  return '';
})();

export const getApiBaseUrl = () => apiBaseUrl;

export const buildApiUrl = (path = '') => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!apiBaseUrl) {
    return normalizedPath;
  }
  return `${apiBaseUrl}${normalizedPath}`;
};
