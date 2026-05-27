import React, { useEffect, useRef } from 'react';
import MyPerformance from './MyPerformance';

const EmployeePerformanceModal = ({ isOpen, onClose, employee, userData, timePeriod, customStartDate, customEndDate }) => {
    const modalRef = useRef(null);
    const touchStartY = useRef(0);
    
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.top = `-${window.scrollY}px`;
        } else {
            const scrollY = document.body.style.top;
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            window.scrollTo(0, parseInt(scrollY || '0') * -1);
        }
        return () => {
            const scrollY = document.body.style.top;
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY) * -1);
            }
        };
    }, [isOpen]);

    // Handle touch events for swipe to close
    const handleTouchStart = (e) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e) => {
        const touchY = e.touches[0].clientY;
        const diff = touchY - touchStartY.current;
        if (diff > 50 && modalRef.current) {
            modalRef.current.style.transform = `translateY(${diff}px)`;
            modalRef.current.style.transition = 'none';
        }
    };

    const handleTouchEnd = (e) => {
        if (modalRef.current) {
            const transform = modalRef.current.style.transform;
            const match = transform.match(/translateY\((\d+)px\)/);
            if (match && parseInt(match[1]) > 100) {
                onClose();
            }
            modalRef.current.style.transform = '';
            modalRef.current.style.transition = '';
        }
    };

    if (!isOpen) return null;

    // Create employee user data object
    const employeeUserData = {
        user_id: employee.user_id,
        id: employee.user_id,
        name: employee.user_name,
        role: 'employee',
        branch: employee.branch
    };

    return (
        <div className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain">
            <div className="flex items-start sm:items-center justify-center min-h-screen p-1 sm:p-3 md:p-6">
                {/* Backdrop with blur */}
                <div 
                    className="fixed inset-0 bg-black/50 sm:bg-black/60 backdrop-blur-sm transition-opacity z-[9998]" 
                    onClick={onClose}
                    aria-label="Close modal"
                ></div>

                {/* Modal */}
                <div 
                    ref={modalRef}
                    className="relative w-full max-w-[98vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-7xl bg-white rounded-t-xl sm:rounded-xl md:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto z-[9999]"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {/* Drag indicator for mobile */}
                    <div className="sticky top-0 z-[101] block sm:hidden w-full pt-2 pb-1 bg-white">
                        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto"></div>
                    </div>

                    {/* Header */}
                    <div className="sticky top-[18px] sm:top-0 z-[100] px-3 sm:px-5 md:px-6 py-2.5 sm:py-3 md:py-4 border-b border-gray-200" style={{ background: `linear-gradient(135deg, #2f3192 0%, #2c4a6e 100%)` }}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm sm:text-base md:text-lg lg:text-base font-bold text-white truncate">
                                    Employee Performance: {employee.user_name}
                                </h3>
                                <p className="text-xs text-white/80 mt-0.5 sm:mt-1 truncate">
                                    Branch: {employee.branch_display || employee.branch}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="absolute top-3 right-3 sm:static self-end sm:self-auto w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 bg-white rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-200 group flex-shrink-0 active:bg-white/30 sm:active:bg-white/20"
                                aria-label="Close modal"
                            >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 text-black group-hover:rotate-90 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 sm:p-4 md:p-5 lg:p-6 relative z-[99]">
                        <MyPerformance
                            userData={employeeUserData}
                            timePeriod={timePeriod}
                            customStartDate={customStartDate}
                            customEndDate={customEndDate}
                            isBranchAdmin={false}
                            isMasterAdmin={false}
                            isITAdmin={false}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeePerformanceModal;