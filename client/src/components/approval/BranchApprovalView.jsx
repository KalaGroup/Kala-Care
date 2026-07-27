/* Generic stage-approver view (L2 / L3) — approves the applications waiting
   at their stage for the branches they cover, plus the ability to create
   applications of ANY type themselves. Self-approval is removed: their own
   submissions are auto-approved within their limit, otherwise they go to the
   next level. */
import { useState } from 'react';
import { Plus } from 'lucide-react';
import ApproverWorkspace from './ApproverWorkspace';
import { CreateApplicationModal } from './ApprovalShared';

export default function BranchApprovalView({ pendingStatus = 'pending_l2', pendingLabel = 'Pending My Approval', canCreate = true, showMine = true }) {
    const [showCreate, setShowCreate] = useState(false);
    // remount the workspace after a create so the new application shows up —
    // it reopens on the My NFA tab so the fresh record is right in front
    const [reloadKey, setReloadKey] = useState(0);
    const [startTab, setStartTab] = useState('pending');

    return (
        <>
            <ApproverWorkspace
                key={reloadKey}
                pendingStatus={pendingStatus}
                pendingLabel={pendingLabel}
                initialTab={startTab}
                showMine={showMine}
                headerActions={canCreate ? (
                    <button onClick={() => setShowCreate(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
                        <Plus size={14} /> Create NFA
                    </button>
                ) : null}
            />
            {canCreate && showCreate && (
                <CreateApplicationModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setStartTab('mine'); setReloadKey(k => k + 1); }}
                />
            )}
        </>
    );
}
