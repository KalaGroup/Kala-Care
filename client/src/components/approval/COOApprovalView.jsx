/* L5 (COO) view — final approval across every branch. Sees ALL applications
   and can create applications too. The Authority Matrix and the Reports box
   open from the page header. */
import BranchApprovalView from './BranchApprovalView';
import { levelName } from './ApprovalShared';

export default function COOApprovalView() {
    return (
        <BranchApprovalView
            pendingStatus="pending_l5"
            pendingLabel={`Pending L5 (${levelName('l5')}) Approval`}
            canCreate={false}
            showMine={false}
        />
    );
}
