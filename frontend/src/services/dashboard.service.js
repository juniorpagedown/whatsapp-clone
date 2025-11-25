import axios from 'axios';

export const dashboardService = {
    getStats: async () => {
        const response = await axios.get('/api/dashboard/stats');
        return response.data;
    }
};
