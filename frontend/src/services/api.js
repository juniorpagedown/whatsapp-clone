import axios from 'axios';
import { buildApiUrl } from '../utils/api';

// Criar instância do axios com configuração base
const api = axios.create({
    baseURL: buildApiUrl('/api'),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor para adicionar token de autenticação
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Adicionar instance-id se disponível
        const instanceId = localStorage.getItem('selected_instance_id');
        if (instanceId) {
            config.headers['x-instance-id'] = instanceId;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Interceptor para tratamento de erros
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expirado ou inválido
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
