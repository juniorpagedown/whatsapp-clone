import axios from 'axios';

export const authService = {
    login: async (email, password) => {
        const response = await axios.post('/api/auth/login', { email, password });
        return response.data;
    },

    register: async (userData) => {
        const response = await axios.post('/api/auth/register', userData);
        return response.data;
    },

    logout: async () => {
        await axios.post('/api/auth/logout');
    },

    getMe: async () => {
        const response = await axios.get('/api/auth/me');
        return response.data;
    },

    setAuthToken: (token) => {
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } else {
            delete axios.defaults.headers.common['Authorization'];
        }
    }
};
