/* Branch Admin view — first-level approval for the applications raised by the
   employees of their branch(es), plus the ability to create applications of
   ANY type themselves. Their own submissions also land in their branch queue:
   they approve them first (within limit = final; beyond = forwarded to HOD,
   then COO by the same limit rules). */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import ApproverWorkspace from './ApproverWorkspace';
import { CreateApplicationModal } from './ApprovalShared';

export default function BranchApprovalView() {
    const [showCreate, setShowCreate] = useState(false);
    // remount the workspace after a create so the new application shows up
    const [reloadKey, setReloadKey] = useState(0);

    return (
        <>
            <ApproverWorkspace
                key={reloadKey}
                pendingStatus="pending_branch"
                pendingLabel="Pending My Approval"
                headerActions={
                    <button onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
                        <Plus size={14} /> Create Application
                    </button>
                }
            />
            {showCreate && (
                <CreateApplicationModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => setReloadKey(k => k + 1)}
                />
            )}
        </>
    );
}
