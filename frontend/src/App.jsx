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

          <Route path="/" element={<Navigate to="/groups" replace />} />

          <Route
            path="/groups"
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
                  Selecione um grupo para visualizar as mensagens
                </div>
              )}
            />
            <Route path=":chatId" element={<GroupChatPage />} />
          </Route>

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
          <Route path="*" element={<Navigate to="/groups" replace />} />
        </Routes>
      </InstanceProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
