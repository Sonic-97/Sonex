import axios from 'axios';

const customerApi = axios.create({
  baseURL: (typeof window !== 'undefined' ? window.location.origin : '') + '/api',
});

customerApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('customer_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

customerApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('customer_token');
      sessionStorage.removeItem('customer_id');
      sessionStorage.removeItem('customer_name');
      window.location.href = '/customer/login';
    }
    return Promise.reject(err);
  }
);

export default customerApi;
