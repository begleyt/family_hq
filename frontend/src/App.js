import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import RequestsPage from './pages/RequestsPage';
import GroceryPage from './pages/GroceryPage';
import MealPlannerPage from './pages/MealPlannerPage';
import AdminUsersPage from './pages/AdminUsersPage';
import PantryPage from './pages/PantryPage';
import SpendingPage from './pages/SpendingPage';
import RecipesPage from './pages/RecipesPage';
import CalendarPage from './pages/CalendarPage';
import PollsPage from './pages/PollsPage';
import CalendarCallbackPage from './pages/CalendarCallbackPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user && !user.mustChangePassword ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/change-password" element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />
      <Route path="/" element={<ProtectedRoute><AppShell><DashboardPage /></AppShell></ProtectedRoute>} />
      <Route path="/requests" element={<ProtectedRoute><AppShell><RequestsPage /></AppShell></ProtectedRoute>} />
      <Route path="/grocery" element={<ProtectedRoute><AppShell><GroceryPage /></AppShell></ProtectedRoute>} />
      <Route path="/meals" element={<ProtectedRoute><AppShell><MealPlannerPage /></AppShell></ProtectedRoute>} />
      <Route path="/pantry" element={<ProtectedRoute><AppShell><PantryPage /></AppShell></ProtectedRoute>} />
      <Route path="/spending" element={<ProtectedRoute><AppShell><SpendingPage /></AppShell></ProtectedRoute>} />
      <Route path="/recipes" element={<ProtectedRoute><AppShell><RecipesPage /></AppShell></ProtectedRoute>} />
      <Route path="/polls" element={<ProtectedRoute><AppShell><PollsPage /></AppShell></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><AppShell><CalendarPage /></AppShell></ProtectedRoute>} />
      <Route path="/calendar-callback" element={<CalendarCallbackPage />} />
      <Route path="/admin/users" element={<ProtectedRoute><AppShell><AdminUsersPage /></AppShell></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
