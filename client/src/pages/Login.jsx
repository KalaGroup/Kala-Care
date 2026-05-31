import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from "react-icons/fa";

// ===== THEME COLOR =====
const themeColor = '#2f3192';
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;

const Login = () => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [rippleEffect, setRippleEffect] = useState(false);
    const [formData, setFormData] = useState({
        userId: '',
        password: ''
    });
    const [focusedField, setFocusedField] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [sliderImages, setSliderImages] = useState([]);
    const navigate = useNavigate();
    const [showPassword, setShowPassword] = useState(false);
    const abortControllerRef = useRef(null);
    const slideIntervalRef = useRef(null);
    const bannersFetchedRef = useRef(false);

    useEffect(() => {
        const user = sessionStorage.getItem('user');
        if (user) {
            navigate('/profile');
        }
    }, [navigate]);

    const fetchBanners = useCallback(async () => {
        if (bannersFetchedRef.current) return;

        // ✅ Load from cache instantly
        const cached = sessionStorage.getItem('banners_cache');
        if (cached) {
            setSliderImages(JSON.parse(cached));
            bannersFetchedRef.current = true;
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const fallback = [
            'https://via.placeholder.com/1200x800?text=Welcome+to+KALA+Care',
            'https://via.placeholder.com/1200x800?text=Your+Health+Our+Priority',
            'https://via.placeholder.com/1200x800?text=Quality+Healthcare+Services'
        ];

        try {
            const response = await axios.get(`${API_BASE_URL}/banners`, {
                signal: abortControllerRef.current.signal,
                timeout: 8000,
                headers: { 'Cache-Control': 'max-age=300' }
            });

            if (response.data.success && response.data.banners.length > 0) {
                const banners = response.data.banners
                    .sort((a, b) => a.position - b.position)
                    .map(banner => `${API_BASE_URL}${banner.image_url}`);
                // ✅ Save to cache
                sessionStorage.setItem('banners_cache', JSON.stringify(banners));
                setSliderImages(banners);
            } else {
                setSliderImages(fallback);
            }
            bannersFetchedRef.current = true;
        } catch (err) {
            if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
                setSliderImages(fallback);
                bannersFetchedRef.current = true;
            }
        }
    }, [API_BASE_URL]);

    // Initial fetch - only once when component mounts
    useEffect(() => {
        fetchBanners();
    }, [fetchBanners]);

    // Replace the existing auto-slide useEffect (around line 85-100) with this:
    useEffect(() => {
        if (sliderImages.length > 0) {
            // Clear existing interval
            if (slideIntervalRef.current) {
                clearInterval(slideIntervalRef.current);
            }

            slideIntervalRef.current = setInterval(() => {
                setCurrentSlide((prev) => {
                    // This will always loop: 0,1,2,0,1,2,0,1,2...
                    return (prev + 1) % sliderImages.length;
                });
            }, 5000);

            return () => {
                if (slideIntervalRef.current) {
                    clearInterval(slideIntervalRef.current);
                }
            };
        }
    }, [sliderImages.length]);

    // Handle input changes
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setRippleEffect(true);
        setError('');
        setLoading(true);

        const loginAbortController = new AbortController();
        const timeoutId = setTimeout(() => loginAbortController.abort(), 30000);

        try {
            const response = await axios.post(`${API_BASE_URL}/users/login`, {
                user_id: formData.userId,
                password: formData.password
            }, {
                signal: loginAbortController.signal,
                timeout: 30000
            });

            if (response.data.success) {
                const branches = response.data.user.branches || [];
                const primary = branches.find(b => b.is_primary) || branches[0] || {
                    branch: response.data.user.branch,
                    branch_name: response.data.user.branch_name
                };

                sessionStorage.setItem('user', JSON.stringify({
                    id: response.data.user.id,
                    user_id: response.data.user.user_id,
                    name: response.data.user.name,
                    branch: primary.branch,                 // <-- current active branch
                    branch_name: primary.branch_name,       // <-- current active branch name
                    primary_branch: primary.branch,         // <-- remember the parent
                    primary_branch_name: primary.branch_name,
                    role: response.data.user.role,
                    is_blocked: response.data.user.is_blocked,
                    can_export: response.data.user.can_export,
                    can_access_expense: response.data.user.can_access_expense === true,  // <-- new
                    session_id: response.data.user.session_id,  // <-- login session for logout tracking
                    branches: branches                      // <-- all accessible branches
                }));

                navigate('/dashboard');
            }

        } catch (err) {
            // Timeout / Abort
            if (
                err.name === 'AbortError' ||
                err.name === 'CanceledError' ||
                err.code === 'ECONNABORTED'
            ) {
                setError('Request timeout. Please check your connection and try again.');
            }
            else if (err.response && err.response.status >= 500) {
                if (err.response.status === 503) {
                    setError('Server is currently down. Please try again later.');
                } else if (err.response.status === 502) {
                    setError('Bad gateway. Server is not responding properly.');
                } else if (err.response.status === 504) {
                    setError('Server timeout. Please try again later.');
                } else {
                    setError('Server error. Please try again later.');
                }
            }
            else if (err.request && !err.response) {
                setError('Unable to connect to server. Please check your internet.');
            }
            else {
                setError(err.response?.data?.message || 'Login failed. Please try again.');
            }

        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    };

    const isFieldFocused = (field) => focusedField === field;
    const hasValue = (field) => formData[field]?.length > 0;

    return (
        <div className="min-h-screen w-full relative overflow-x-hidden flex items-center justify-center p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 via-white to-[#2f3192]/5">
            {/* Modern Grid Background */}
            <div className="absolute inset-0 overflow-hidden">
                {/* Main Grid Pattern */}
                <div className="absolute inset-0" style={{
                    backgroundImage: `
                        linear-gradient(to right, ${themeColor}10 1px, transparent 1px),
                        linear-gradient(to bottom, ${themeColor}10 1px, transparent 1px)
                    `,
                    backgroundSize: '50px 50px',
                }}></div>

                {/* Diagonal Grid Overlay */}
                <div className="absolute inset-0" style={{
                    backgroundImage: `
                        repeating-linear-gradient(45deg, ${themeColor}08 0px, ${themeColor}08 2px, transparent 2px, transparent 8px),
                        repeating-linear-gradient(135deg, ${themeColor}08 0px, ${themeColor}08 2px, transparent 2px, transparent 8px)
                    `,
                }}></div>

                {/* Gradient Overlay for Depth */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white via-transparent to-[#2f3192]/10"></div>

                {/* Static decorative orbs - lightweight */}
                <div className="absolute top-0 -left-40 w-96 h-96 bg-[#2f3192]/10 rounded-full filter blur-2xl"></div>
                <div className="absolute bottom-0 -right-40 w-96 h-96 bg-[#2f3192]/10 rounded-full filter blur-2xl"></div>
            </div>

            {/* Main Container */}
            <div className="relative w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-4 md:gap-6 items-stretch z-10">
                {/* Left side - Advertising box */}
                <div
                    className="hidden lg:block lg:w-2/3 xl:w-[70%] relative overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl min-h-[500px] md:min-h-[600px] lg:min-h-[80vh] xl:min-h-[85vh] group animate-fadeIn"
                    style={{ backgroundColor: `${themeColor}10` }}
                >
                    <div className="absolute inset-0">
                        {sliderImages.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-50">
                                <p className="text-gray-500 text-base font-medium tracking-wide">
                                    Loading...
                                </p>
                            </div>
                        )}
                        {sliderImages.map((img, index) => {
                            const isActive = index === currentSlide;
                            const isPrev = index === (currentSlide - 1 + sliderImages.length) % sliderImages.length;
                            const isNext = index === (currentSlide + 1) % sliderImages.length;

                            // Don't render slides that aren't visible or adjacent — saves GPU
                            if (!isActive && !isPrev && !isNext) return null;

                            return (
                                <div
                                    key={index}
                                    className={`absolute inset-0 transition-all duration-700 ease-in-out ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'
                                        }`}
                                    style={{
                                        transform: isActive
                                            ? 'translateX(0)'
                                            : isPrev
                                                ? 'translateX(-100%)'
                                                : 'translateX(100%)'
                                    }}
                                >
                                    <div className="w-full h-full relative overflow-hidden" style={{ backgroundColor: `${themeColor}08` }}>
                                        {/* Blurred background fill - lightweight version */}
                                        <div
                                            className="absolute inset-0 bg-cover bg-center blur-xl opacity-50"
                                            style={{ backgroundImage: `url(${img})`, transform: 'scale(1.05)' }}
                                        ></div>

                                        {/* Actual image - fits properly without cropping */}
                                        <img
                                            src={img}
                                            alt={`Slide ${index + 1}`}
                                            className="relative w-full h-full object-contain transition-transform duration-700"
                                            loading="eager"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Rest of your slider indicators remain the same */}
                    {sliderImages.length > 0 && (
                        <div className="absolute bottom-4 md:bottom-8 left-1/2 transform -translate-x-1/2 flex space-x-2 md:space-x-3 z-20">
                            {sliderImages.map((_, index) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentSlide(index)}
                                    className={`h-1.5 md:h-2 rounded-full transition-all duration-300 
                        ${index === currentSlide
                                            ? 'w-6 md:w-8 bg-white'
                                            : 'w-1.5 md:w-2 bg-white/50 hover:bg-white/80'}`}
                                    style={{
                                        backgroundColor: index === currentSlide ? themeColor : undefined,
                                    }}
                                    aria-label={`Go to slide ${index + 1}`}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right side - Login box */}
                <div className="w-full lg:w-1/3 xl:w-[30%] bg-white rounded-3xl md:rounded-bl-[50px] md:rounded-tr-[50px] shadow-2xl pt-0 pr-6 pb-6 pl-6 flex items-center justify-center animate-slideUp border border-gray-100">
                    <div className="w-full max-w-sm mx-auto space-y-6 md:space-y-8">
                        {/* Logo - Centered and Bigger */}
                        <div className="flex justify-center mb-4 md:mb-6">
                            <img
                                src="/logo.png"
                                alt="Company Logo"
                                className="h-28 w-28 md:h-28 md:w-28 lg:h-28 lg:w-28 object-contain"
                                loading="eager"
                            />
                        </div>

                        {/* Header */}
                        <div className="text-center">
                            <h2 className="text-[28px] md:text-3xl font-bold text-gray-900 mb-2">Welcome</h2>
                            <p className="text-gray-700 font-semibold text-sm md:text-base">Sign-in to your account</p>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 text-red-600 font-bold p-3 rounded-lg text-sm text-center break-words">
                                {error}
                            </div>
                        )}

                        {/* Login Form */}
                        <form className="space-y-5 md:space-y-6" onSubmit={handleLogin}>
                            {/* User ID Field */}
                            <div className="relative">
                                <div className={`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-all duration-300
                    ${isFieldFocused('userId') || hasValue('userId') ? 'text-[#2f3192]' : 'text-gray-700'}`}>
                                    <i className="far fa-user text-base md:text-lg"></i>
                                </div>
                                <input
                                    type="text"
                                    name="userId"
                                    value={formData.userId}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField('userId')}
                                    onBlur={() => setFocusedField(null)}
                                    className="w-full pl-9 md:pl-10 pr-3 md:pr-4 py-3 md:py-4 bg-white/50 border-2 border-gray-300/30 rounded-xl text-gray-900 font-bold placeholder-transparent focus:outline-none transition-all duration-300 text-sm md:text-base"
                                    style={{
                                        borderColor: isFieldFocused('userId') ? themeColor : undefined,
                                        boxShadow: isFieldFocused('userId') ? `0 0 0 4px ${themeColor}15` : undefined
                                    }}
                                    placeholder="User ID"
                                    required
                                    autoComplete="username"
                                />
                                <label className={`absolute left-8 md:left-9 transition-all duration-200 pointer-events-none px-1 md:px-2 font-bold rounded-md text-xs md:text-sm
                    ${isFieldFocused('userId') || hasValue('userId')
                                        ? '-top-3 left-7 md:left-8 text-white bg-[#2f3192] border-2 border-[#2f3192]'
                                        : 'top-3 md:top-4 text-gray-700 bg-transparent'}`}
                                    style={{
                                        backgroundColor: (isFieldFocused('userId') || hasValue('userId')) ? themeColor : 'transparent',
                                        borderColor: (isFieldFocused('userId') || hasValue('userId')) ? themeColor : 'transparent'
                                    }}>
                                    User ID
                                </label>
                            </div>

                            {/* Password Field */}
                            <div className="relative">
                                <div className={`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-all duration-300
                    ${isFieldFocused('password') || hasValue('password') ? 'text-[#2f3192]' : 'text-gray-700'}`}>
                                    <i className="far fa-lock text-base md:text-lg"></i>
                                </div>

                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    onFocus={() => setFocusedField('password')}
                                    onBlur={() => setFocusedField(null)}
                                    className="w-full pl-9 md:pl-10 pr-10 md:pr-12 py-3 md:py-4 bg-white/50 border-2 border-gray-300/30 rounded-xl text-gray-900 font-bold placeholder-transparent focus:outline-none transition-all duration-300 text-sm md:text-base"
                                    style={{
                                        borderColor: isFieldFocused('password') ? themeColor : undefined,
                                        boxShadow: isFieldFocused('password') ? `0 0 0 4px ${themeColor}15` : undefined
                                    }}
                                    placeholder="Password"
                                    required
                                    autoComplete="current-password"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-900 transition-colors"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <FaEyeSlash size={16} className="md:w-[18px] md:h-[18px]" /> : <FaEye size={16} className="md:w-[18px] md:h-[18px]" />}
                                </button>

                                <label className={`absolute left-8 md:left-9 transition-all duration-200 pointer-events-none px-1 md:px-2 font-bold rounded-md text-xs md:text-sm
                    ${isFieldFocused('password') || hasValue('password')
                                        ? '-top-3 left-7 md:left-8 text-white bg-[#2f3192] border-2 border-[#2f3192]'
                                        : 'top-3 md:top-4 text-gray-700 bg-transparent'}`}
                                    style={{
                                        backgroundColor: (isFieldFocused('password') || hasValue('password')) ? themeColor : 'transparent',
                                        borderColor: (isFieldFocused('password') || hasValue('password')) ? themeColor : 'transparent'
                                    }}>
                                    Password
                                </label>
                            </div>

                            {/* Submit Button */}
                            <div className="relative overflow-hidden rounded-xl group pt-2 flex justify-center">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-2/3 md:w-1/2 py-3 md:py-1.5 px-4 md:px-2 font-bold text-white text-sm md:text-md rounded-xl transform transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                                    style={{
                                        background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}dd 100%)`,
                                        boxShadow: `0 10px 25px -5px ${themeColor}80`
                                    }}
                                >
                                    <span className="relative z-10">
                                        {loading ? 'Signing In...' : 'Sign In'}
                                    </span>

                                    {rippleEffect && (
                                        <span className="absolute inset-0 bg-white/30 animate-ripple"></span>
                                    )}

                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/20"></div>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <style jsx>{`
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .animate-fadeIn { animation: fadeIn 0.8s ease-out; }

    @keyframes slideUp {
        from { opacity: 0; transform: translateY(30px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-slideUp { animation: slideUp 0.6s ease-out; }

    @keyframes ripple {
        0% { transform: scale(0); opacity: 0.5; }
        100% { transform: scale(4); opacity: 0; }
    }
    .animate-ripple { animation: ripple 0.6s ease-out; }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #f1f1f1; }
    ::-webkit-scrollbar-thumb { background: ${themeColor}; border-radius: 10px; }

    @media (max-width: 480px) {
        .break-words { word-break: break-word; }
    }

    /* Stop animations during screen share / when user prefers reduced motion */
    @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
        }
    }
`}</style>
        </div>
    );
};

export default Login;