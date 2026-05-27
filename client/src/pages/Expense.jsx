import React from 'react';

// Import the two different components
import BranchAdminExpense from '../components/BranchAdminExpense';
import HOExpense from '../components/HOExpense';

const Expense = () => {
  // Get user from sessionStorage
  const user = JSON.parse(sessionStorage.getItem('user'));

  // Check if user is branch_admin
  const isBranchAdmin = user?.role === 'branch_admin' || user?.role === 'employee';

  // Check if user is master_admin, it_admin, or employee with HO branch
  const isMasterOrITAdmin = user?.role === 'master_admin' || user?.role === 'it_admin';
  const isHOEmployee = user?.role === 'employee' && user?.branch === 'HO';

  // Show HOExpense for master_admin, it_admin, and HO employees
  const showHOExpense = isMasterOrITAdmin || isHOEmployee;

  // If user is branch_admin, show BranchAdminExpense component
  if (isBranchAdmin) {
    return <BranchAdminExpense />;
  }

  // If user is master_admin, it_admin, or HO employee, show HOExpense component
  if (showHOExpense) {
    return <HOExpense />;
  }
}

export default Expense;