// infrastructure/websocket/socketManager.js
let ioInstance = null;

const conversationRoom = (conversationId) => `conversation:${conversationId}`;

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => ioInstance;

const emitConversationMessage = (conversationId, message) => {
  if (!ioInstance || !conversationId) {
    return;
  }

  const room = conversationRoom(conversationId);
  ioInstance.to(room).emit('conversation:message', {
    conversationId,
    message
  });
  ioInstance.emit('conversation:updated', {
    conversationId,
    message
  });
};

const registerSocketHandlers = (socket) => {
  socket.on('conversation:join', (conversationId) => {
    const id = parseInt(conversationId, 10);
    if (Number.isNaN(id)) {
      return;
    }
    socket.join(conversationRoom(id));
  });

  socket.on('conversation:leave', (conversationId) => {
    const id = parseInt(conversationId, 10);
    if (Number.isNaN(id)) {
      return;
    }
    socket.leave(conversationRoom(id));
  });
};

module.exports = {
  setIO,
  getIO,
  emitConversationMessage,
  registerSocketHandlers
};
