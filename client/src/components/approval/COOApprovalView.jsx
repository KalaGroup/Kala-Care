/* COO view — final approval across every branch. The Authority Matrix and
   the Reports box open from the page header. */
import ApproverWorkspace from './ApproverWorkspace';

export default function COOApprovalView() {
    return (
        <ApproverWorkspace
            pendingStatus="pending_coo"
            pendingLabel="Pending COO Approval"
        />
    );
}
