import React from 'react';
import BranchAdminExpenseDash from '../components/BranchAdminExpenseDash';
import HOExpenseDash from '../components/HOExpenseDash';

const ExDashboard = () => {
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const role = user?.role;
  const branch = String(user?.branch || '').trim();

  // Branch admins → branch dashboard
  if (role === 'branch_admin') {
    return <BranchAdminExpenseDash />;
  }

  // Master admin / IT admin at HO → HO dashboard
  if (
    role === 'master_admin' ||
    role === 'it_admin' ||
    (role === 'employee' && branch === 'HO')
  ) {
    return <HOExpenseDash />;
  }

  // Fallback for any other case
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '2rem',
      fontWeight: 'bold',
      color: '#555'
    }}>
      Under Development...
    </div>
  );
};

export default ExDashboard;