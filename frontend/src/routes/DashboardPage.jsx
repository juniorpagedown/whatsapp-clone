import React from 'react';
import Header from '../components/Header.jsx';
import DashboardAnalytics from '../Dashboard.jsx';

const DashboardPage = () => {
  return (
    <div className="flex h-screen w-full justify-center bg-wa-bg transition-colors">
      <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden bg-wa-panel text-wa-text-primary transition-colors">
        <Header />
        <div className="flex-1 overflow-auto bg-wa-bg px-6 py-8 transition-colors">
          <DashboardAnalytics />
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
