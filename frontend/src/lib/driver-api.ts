import axios from 'axios';

const driverApi = axios.create({
  baseURL: (typeof window !== 'undefined' ? window.location.origin : '') + '/api',
});

driverApi.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('driver_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

driverApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('driver_token');
      sessionStorage.removeItem('driver_id');
      sessionStorage.removeItem('driver_name');
      window.location.href = '/driver/login';
    }
    return Promise.reject(err);
  }
);

export default driverApi;
