import React from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes
} from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './routes/LoginPage';
import GroupsPage from './routes/GroupsPage.jsx';
import GroupChatPage from './routes/GroupChatPage.jsx';
import DashboardPage from './routes/DashboardPage.jsx';
import AuditHistoryPage from './routes/AuditHistoryPage.tsx';
import ContextoPage from './routes/ContextoPage.tsx';
import AdminClassificacoesPage from './routes/AdminClassificacoesPage.tsx';

const App = () => (
  <BrowserRouter>
    <AuthProvider>
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
          path="/auditoria"
          element={
            <ProtectedRoute>
              <AuditHistoryPage />
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
        <Route
          path="/admin/classificacoes"
          element={
            <ProtectedRoute>
              <AdminClassificacoesPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/groups" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
