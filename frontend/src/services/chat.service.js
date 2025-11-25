import axios from 'axios';

export const chatService = {
    listConversations: async (params, signal) => {
        const response = await axios.get('/api/conversas', { params, signal });
        return response.data;
    },

    listMessages: async (params, signal) => {
        const response = await axios.get('/api/mensagens', { params, signal });
        return response.data;
    },

    sendMessage: async (data) => {
        const response = await axios.post('/api/mensagens/send', data);
        return response.data;
    }
};
