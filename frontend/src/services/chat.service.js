import api from './api';

export const chatService = {
    listConversations: async (params, signal) => {
        const response = await api.get('/conversas', { params, signal });
        return response.data;
    },

    listMessages: async (params, signal) => {
        const response = await api.get('/mensagens', { params, signal });
        return response.data;
    },

    sendMessage: async (data) => {
        const response = await api.post('/mensagens/send', data);
        return response.data;
    }
};
