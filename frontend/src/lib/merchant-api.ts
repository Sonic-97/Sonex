import axios from 'axios';

const merchantApi = axios.create({
  baseURL: (typeof window !== 'undefined' ? window.location.origin : '') + '/api',
});

merchantApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('merchant_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

merchantApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('merchant_token');
      sessionStorage.removeItem('merchant_id');
      sessionStorage.removeItem('merchant_cafe_id');
      window.location.href = '/merchant/login';
    }
    return Promise.reject(err);
  }
);

export default merchantApi;
