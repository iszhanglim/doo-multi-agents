import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import AssessPage from './pages/AssessPage';
import PortraitPage from './pages/PortraitPage';
import ClassStatsPage from './pages/ClassStatsPage';
import ProfilePage from './pages/ProfilePage';
import AdminUsersPage from './pages/AdminUsersPage';
import LoginPage from './pages/LoginPage';
import './App.css';

type Page = 'dashboard' | 'assess' | 'portraits' | 'class-stats' | 'profile' | 'admin-users';

function AppContent() {
  const { isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setCurrentPage('dashboard')} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'assess':
        return <AssessPage />;
      case 'portraits':
        return <PortraitPage />;
      case 'class-stats':
        return <ClassStatsPage />;
      case 'profile':
        return <ProfilePage />;
      case 'admin-users':
        return <AdminUsersPage />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="app">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
      />
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
