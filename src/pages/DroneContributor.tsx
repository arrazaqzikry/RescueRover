import React, { useState } from "react";

const RegisterDrone: React.FC = () => {
    const [droneId, setDroneId] = useState<string>("");
    const [name, setName] = useState<string>("");
    const [battery, setBattery] = useState<number | "">("");
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!droneId || !name || battery === "") {
            alert("Please fill in all fields.");
            return;
        }

        if (Number(battery) < 0 || Number(battery) > 100) {
            alert("Battery percentage must be between 0 and 100.");
            return;
        }

        setIsSubmitting(true);

        const droneData = {
            droneId,
            name,
            battery: Number(battery)
        };

        console.log("Drone Registered:", droneData);

        // Simulate API call
        setTimeout(() => {
            alert("✅ Drone registration successful");
            setDroneId("");
            setName("");
            setBattery("");
            setIsSubmitting(false);
        }, 1000);
    };

    return (
        <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
            {/* Back Button */}
            <a
                href="/"
                className="absolute top-6 left-6 z-10 group flex items-center gap-2
                         bg-card/80 backdrop-blur-sm border border-border/50
                         hover:bg-card hover:border-primary/30 text-foreground
                         py-2.5 px-5 rounded-xl font-mono text-sm
                         transition-all duration-300 shadow-lg hover:shadow-primary/5"
            >
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="group-hover:-translate-x-1 transition-transform"
                >
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span>BACK TO HOME</span>
            </a>

            {/* Background decorative elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl animate-pulse animation-delay-2000" />

                {/* Grid overlay */}
                <div className="absolute inset-0 bg-grid-pattern opacity-5" />

                {/* Floating drone icons */}
                <div className="absolute top-1/4 left-1/4 animate-float">
                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/10">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        <circle cx="12" cy="12" r="4"/>
                    </svg>
                </div>

                <div className="absolute bottom-1/3 right-1/4 animate-float animation-delay-1000">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-blue-500/10">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        <circle cx="12" cy="12" r="4"/>
                    </svg>
                </div>
            </div>

            {/* Main Content */}
            <div className="relative flex items-center justify-center min-h-screen p-6">
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center gap-2 mb-4">
                            <div className="w-1 h-6 bg-primary/50 rounded-full" />
                            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                                NEW DRONE REGISTRATION
                            </span>
                            <div className="w-1 h-6 bg-primary/50 rounded-full" />
                        </div>
                        <h1 className="text-4xl font-bold font-mono bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                            REGISTER DRONE
                        </h1>
                    </div>

                    {/* Form Card */}
                    <div className="relative group">
                        {/* Animated border */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 via-primary/20 to-primary/30 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500 animate-gradient" />

                        {/* Main card */}
                        <div className="relative bg-card/90 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">

                            <form onSubmit={handleSubmit} className="space-y-6">

                                {/* Drone ID Field */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                                            <line x1="9" y1="9" x2="15" y2="15"/>
                                            <line x1="15" y1="9" x2="9" y2="15"/>
                                        </svg>
                                        DRONE ID
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="e.g., UAV-001, DR-2024"
                                            value={droneId}
                                            onChange={(e) => setDroneId(e.target.value.toUpperCase())}
                                            required
                                            className="w-full bg-background/50 border border-border/50 rounded-xl p-4
                                                     font-mono text-sm placeholder:text-muted-foreground/30
                                                     focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border/80"
                                        />
                                        {droneId && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Drone Name Field */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                            <circle cx="12" cy="7" r="4"/>
                                        </svg>
                                        DRONE NAME
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g., Phoenix, Eagle, Scout-1"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        className="w-full bg-background/50 border border-border/50 rounded-xl p-4
                                                 font-mono text-sm placeholder:text-muted-foreground/30
                                                 focus:border-primary/50 focus:outline-none
                                                 focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                 hover:border-border/80"
                                    />
                                </div>

                                {/* Battery Field with visual indicator */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="2" y="7" width="16" height="10" rx="2" ry="2"/>
                                            <line x1="22" x2="22" y1="11" y2="13"/>
                                        </svg>
                                        BATTERY LEVEL
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder="0-100"
                                            value={battery}
                                            onChange={(e) =>
                                                setBattery(e.target.value === "" ? "" : Number(e.target.value))
                                            }
                                            min="0"
                                            max="100"
                                            required
                                            className="w-full bg-background/50 border border-border/50 rounded-xl p-4
                                                     font-mono text-sm placeholder:text-muted-foreground/30 pr-16
                                                     focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border/80"
                                        />
                                        {battery !== "" && (
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                <span className="text-xs font-mono text-muted-foreground">
                                                    {battery}%
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Battery visual indicator */}
                                    {battery !== "" && (
                                        <div className="mt-2">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-border/50 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-500"
                                                        style={{
                                                            width: `${battery}%`,
                                                            backgroundColor:
                                                                Number(battery) > 80 ? '#10B981' :
                                                                    Number(battery) > 50 ? '#F59E0B' :
                                                                        Number(battery) > 20 ? '#F97316' : '#EF4444'
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-mono text-muted-foreground">
                                                    {Number(battery) > 80 ? 'Excellent' :
                                                        Number(battery) > 50 ? 'Good' :
                                                            Number(battery) > 20 ? 'Fair' : 'Low'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Stats Preview */}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold font-mono text-primary">
                                            {droneId ? '✓' : '?'}
                                        </div>
                                        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
                                            ID VALIDATION
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold font-mono text-primary">
                                            {battery || '0'}%
                                        </div>
                                        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
                                            POWER LEVEL
                                        </div>
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="group relative w-full mt-6 bg-gradient-to-r from-primary to-primary/90
                                             text-primary-foreground py-4 rounded-xl font-mono text-sm font-semibold
                                             transition-all duration-300 transform hover:scale-[1.02]
                                             hover:shadow-2xl hover:shadow-primary/25 disabled:opacity-50
                                             disabled:cursor-not-allowed disabled:hover:scale-100
                                             focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        {isSubmitting ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                REGISTERING...
                                            </>
                                        ) : (
                                            <>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M12 5v14M5 12h14"/>
                                                </svg>
                                                REGISTER DRONE
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                                     className="group-hover:translate-x-1 transition-transform">
                                                    <path d="M5 12h14M12 5l7 7-7 7"/>
                                                </svg>
                                            </>
                                        )}
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Footer Note */}
                    <div className="mt-6 text-center">
                        <p className="text-[8px] font-mono text-muted-foreground/30 tracking-[0.2em]">
                            ENSURE DRONE IS CHARGED • VERIFY IDENTIFICATION • CALIBRATE SENSORS
                        </p>
                    </div>
                </div>
            </div>

            {/* Custom animations */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(5deg); }
                }
                
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                
                @keyframes gradient {
                    0%, 100% { opacity: 0.3; transform: rotate(0deg); }
                    50% { opacity: 0.6; transform: rotate(180deg); }
                }
                
                .animate-gradient {
                    animation: gradient 4s linear infinite;
                }
                
                .animation-delay-1000 {
                    animation-delay: 1000ms;
                }
                
                .animation-delay-2000 {
                    animation-delay: 2000ms;
                }
                
                .bg-grid-pattern {
                    background-image: 
                        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                    background-size: 40px 40px;
                }
            `}</style>
        </div>
    );
};

export default RegisterDrone;