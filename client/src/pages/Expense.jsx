import React from 'react';

// Import the two different components
import BranchAdminExpense from '../components/BranchAdminExpense';
import HOExpense from '../components/HOExpense';

const Expense = () => {
  const user = JSON.parse(sessionStorage.getItem('user'));

  // An employee is a branch admin ONLY if they are not at HO
  const isBranchAdmin =
    user?.role === 'branch_admin' ||
    (user?.role === 'employee' && user?.branch !== 'HO');

  // HO-level views: master_admin, it_admin, or an employee at HO
  const isMasterOrITAdmin = user?.role === 'master_admin' || user?.role === 'it_admin';
  const isHOEmployee = user?.role === 'employee' && user?.branch === 'HO';
  const showHOExpense = isMasterOrITAdmin || isHOEmployee;

  if (isBranchAdmin) {
    return <BranchAdminExpense />;
  }

  if (showHOExpense) {
    return <HOExpense />;
  }

  return null; // fallback so the component always returns something
};

export default Expense;