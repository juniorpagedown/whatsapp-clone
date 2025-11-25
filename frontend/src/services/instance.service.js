import api from './api';

export const instanceService = {
    listInstances: async () => {
        const response = await api.get('/instances');
        return response.data;
    },

    createInstance: async (data) => {
        const response = await api.post('/instances', data);
        return response.data;
    },

    setInstanceId: (instanceId) => {
        if (instanceId) {
            localStorage.setItem('selected_instance_id', instanceId);
            api.defaults.headers.common['x-instance-id'] = instanceId;
        } else {
            localStorage.removeItem('selected_instance_id');
            delete api.defaults.headers.common['x-instance-id'];
        }
    }
};
