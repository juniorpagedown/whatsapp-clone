import React from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { InstanceProvider } from './contexts/InstanceContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './routes/LoginPage';
import GroupsPage from './routes/GroupsPage.jsx';
import GroupChatPage from './routes/GroupChatPage.jsx';
import DashboardPage from './routes/DashboardPage.jsx';
import ContextoPage from './routes/ContextoPage.tsx';

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <InstanceProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Redireciona para conversas */}
          <Route path="/" element={<Navigate to="/conversas" replace />} />

          {/* Rota principal: conversas (grupos + chats individuais) */}
          <Route
            path="/conversas"
            element={
              <ProtectedRoute>
                <GroupsPage />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={(
                <div className="flex h-full items-center justify-center text-wa-text-secondary">
                  Selecione uma conversa para visualizar as mensagens
                </div>
              )}
            />
            {/* Rota para chats individuais */}
            <Route path="chat/:chatId" element={<GroupChatPage />} />
            {/* Rota para grupos */}
            <Route path="grupo/:chatId" element={<GroupChatPage />} />
          </Route>

          {/* Mantém /groups para compatibilidade (redireciona para /conversas) */}
          <Route path="/groups" element={<Navigate to="/conversas" replace />} />
          <Route path="/groups/:chatId" element={<Navigate to="/conversas/chat/:chatId" replace />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/contexto"
            element={
              <ProtectedRoute>
                <ContextoPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/conversas" replace />} />
        </Routes>
      </InstanceProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
