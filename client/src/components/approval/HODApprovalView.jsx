/* HOD view — second-level approval, across every branch, after the branch
   admin has passed the application. Categories assigned to specific HOD
   users (Authority Matrix) appear only in those users' tables. The Reports
   box opens from the page header. */
import ApproverWorkspace from './ApproverWorkspace';

export default function HODApprovalView() {
    return (
        <ApproverWorkspace
            pendingStatus="pending_hod"
            pendingLabel="Pending HOD Approval"
        />
    );
}
