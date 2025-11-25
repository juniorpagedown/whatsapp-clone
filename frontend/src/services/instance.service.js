import axios from 'axios';

export const instanceService = {
    listInstances: async () => {
        const response = await axios.get('/api/instances');
        return response.data;
    },

    createInstance: async (data) => {
        const response = await axios.post('/api/instances', data);
        return response.data;
    },

    setInstanceId: (instanceId) => {
        if (instanceId) {
            axios.defaults.headers.common['x-instance-id'] = instanceId;
        } else {
            delete axios.defaults.headers.common['x-instance-id'];
        }
    }
};
