/* L4 (HOD) view — approves after the branch stages, across every branch,
   category-wise per the Authority Matrix. Sees ALL applications, and can
   create applications too (self-approval removed — own records auto-approve
   within their limit or go to L5). */
import BranchApprovalView from './BranchApprovalView';
import { levelName } from './ApprovalShared';

export default function HODApprovalView() {
    return (
        <BranchApprovalView
            pendingStatus="pending_l4"
            pendingLabel={`Pending L4 (${levelName('l4')}) Approval`}
        />
    );
}
