import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useUploads } from '../utils/uploadStatus';

/* ----------------------------------------------------------------------------
   App-wide notice for uploads that are still running (currently the Part Detail
   Info master import).

   Leaving the page is fine — the request is a fetch that outlives the screen
   that started it, and its result toast fires wherever the user has moved to.
   So this warns rather than blocks: a banner that follows the user across pages,
   a toast the moment they navigate mid-upload, and a real browser prompt if they
   try to close or reload the tab, which WOULD kill the request.
---------------------------------------------------------------------------- */
const UploadGuard = () => {
    const jobs = useUploads();
    const busy = jobs.length > 0;
    const { pathname } = useLocation();
    const lastPath = useRef(pathname);

    // Closing / reloading the tab really does lose the upload — let the browser ask.
    useEffect(() => {
        if (!busy) return;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [busy]);

    // Changing page is allowed, so say so instead of letting it look finished.
    useEffect(() => {
        if (pathname === lastPath.current) return;
        lastPath.current = pathname;
        if (busy) {
            toast('Data is still uploading — please wait. It keeps running in the background.',
                { duration: 5000 });
        }
    }, [pathname, busy]);

    if (!busy) return null;

    return (
        <div className="upload-guard-box fixed bottom-4 left-1/2 -translate-x-1/2 z-[400] flex max-w-[92vw] items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg">
            <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
            <div className="min-w-0">
                <p className="text-[12.5px] font-bold leading-tight text-amber-900">
                    {jobs.length === 1 ? jobs[0].label : `${jobs.length} uploads`} in progress — please wait
                </p>
                <p className="text-[11px] leading-tight text-amber-800/80">
                    You can keep using the app; the upload continues in the background. Don't close or reload this tab.
                </p>
            </div>
        </div>
    );
};

export default UploadGuard;
