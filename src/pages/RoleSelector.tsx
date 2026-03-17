import React from "react";

const WelcomePage: React.FC = () => {
    return (
        <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
            {/* Animated background grid */}
            <div className="absolute inset-0 bg-grid-pattern opacity-5" />

            {/* Floating orbs */}
            <div className="absolute top-20 left-20 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-20 right-20 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse animation-delay-2000" />
            <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl animate-pulse animation-delay-1000" />

            {/* Drone silhouette animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/4 right-1/4 animate-float">
                    <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/10">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        <circle cx="12" cy="12" r="4"/>
                    </svg>
                </div>
                <div className="absolute bottom-1/3 left-1/4 animate-float animation-delay-2000">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-blue-500/10">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        <circle cx="12" cy="12" r="4"/>
                    </svg>
                </div>
            </div>

            {/* Main content */}
            <div className="relative flex items-center justify-center min-h-screen p-6">
                {/* Animated border container */}
                <div className="relative group max-w-3xl w-full">
                    {/* Rotating gradient border */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 via-primary/20 to-primary/30 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-gradient" />

                    {/* Main card with glass effect */}
                    <div className="relative bg-card/90 backdrop-blur-xl border border-white/10 rounded-3xl p-12 md:p-16 shadow-2xl overflow-hidden">

                        {/* Inner glow */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />

                        {/* Content */}
                        <div className="relative z-10 text-center">

                            {/* Animated logo/badge */}
                            <div className="inline-flex items-center justify-center gap-2 mb-6">
                                <div className="w-2 h-2 bg-primary/50 rounded-full animate-ping" />
                                <div className="w-2 h-2 bg-primary/50 rounded-full animate-ping animation-delay-500" />
                                <div className="w-2 h-2 bg-primary/50 rounded-full animate-ping animation-delay-1000" />
                            </div>

                            {/* Title with gradient */}
                            <h1 className="font-mono text-5xl md:text-7xl font-bold mb-4 tracking-tight">
                                <span className="bg-gradient-to-r from-foreground via-foreground to-primary bg-clip-text text-transparent">
                                    AEGIS
                                </span>
                                <span className="bg-gradient-to-r from-primary to-blue-500 bg-clip-text text-transparent">
                                    DRONE
                                </span>
                            </h1>

                            {/* Animated underline */}
                            <div className="flex justify-center gap-1 mb-8">
                                <div className="w-16 h-0.5 bg-primary/30 rounded-full" />
                                <div className="w-16 h-0.5 bg-primary/50 rounded-full animate-pulse" />
                                <div className="w-16 h-0.5 bg-primary/30 rounded-full" />
                            </div>

                            {/* Subtitle with typing effect */}
                            <div className="space-y-2 mb-12">
                                <p className="text-sm md:text-base text-muted-foreground/80 max-w-xl mx-auto leading-relaxed font-mono">
                                    <span className="inline-block animate-typing overflow-hidden whitespace-nowrap border-r-2 border-primary/50 pr-1">
                                        Autonomous Swarm Intelligence for Disaster Response.
                                    </span>
                                </p>
                                <p className="text-sm text-muted-foreground/60 max-w-lg mx-auto leading-relaxed">
                                    Detect survivors, coordinate rescue drones, and restore hope
                                    even when communication infrastructure fails.
                                </p>
                            </div>

                            {/* Stats preview */}
                            <div className="grid grid-cols-3 gap-4 md:gap-8 mb-12">
                                <div className="text-center group/stat">
                                    <div className="text-2xl md:text-3xl font-bold font-mono text-primary mb-1">10+</div>
                                    <div className="text-[8px] md:text-[10px] font-mono text-muted-foreground/50 tracking-wider">
                                        ACTIVE DRONES
                                    </div>
                                    <div className="w-0 group-hover/stat:w-full h-px bg-primary/30 mx-auto transition-all duration-300" />
                                </div>
                                <div className="text-center group/stat">
                                    <div className="text-2xl md:text-3xl font-bold font-mono text-primary mb-1">99%</div>
                                    <div className="text-[8px] md:text-[10px] font-mono text-muted-foreground/50 tracking-wider">
                                        SUCCESS RATE
                                    </div>
                                    <div className="w-0 group-hover/stat:w-full h-px bg-primary/30 mx-auto transition-all duration-300" />
                                </div>
                                <div className="text-center group/stat">
                                    <div className="text-2xl md:text-3xl font-bold font-mono text-primary mb-1">24/7</div>
                                    <div className="text-[8px] md:text-[10px] font-mono text-muted-foreground/50 tracking-wider">
                                        DEPLOYMENT
                                    </div>
                                    <div className="w-0 group-hover/stat:w-full h-px bg-primary/30 mx-auto transition-all duration-300" />
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                                {/* Admin Button */}
                                <a
                                    href="/Disaster"
                                    className="group relative w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-primary to-primary/80
                                             text-primary-foreground rounded-xl font-mono text-sm font-semibold
                                             transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-primary/25
                                             focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                            <circle cx="12" cy="12" r="4"/>
                                        </svg>
                                        COMMAND CENTER
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                             className="group-hover:translate-x-1 transition-transform">
                                            <path d="M5 12h14M12 5l7 7-7 7"/>
                                        </svg>
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                </a>

                                {/* Contributor Button */}
                                <a
                                    href="/User"
                                    className="group relative w-full sm:w-auto px-8 py-4 bg-card/50 backdrop-blur-sm
                                             border border-white/10 text-foreground rounded-xl font-mono text-sm font-semibold
                                             transition-all duration-300 hover:border-primary/50 hover:bg-card/80
                                             focus:outline-none focus:ring-2 focus:ring-primary/50 overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                            <circle cx="12" cy="7" r="4" />
                                            <path d="M17 11l2 2-2 2" />
                                            <path d="M7 11l-2 2 2 2" />
                                        </svg>
                                        DRONE CONTRIBUTOR
                                    </span>
                                </a>
                            </div>

                            {/* Footer note */}
                            <div className="mt-12 text-center">
                                <p className="text-[8px] md:text-[10px] font-mono text-muted-foreground/30 tracking-[0.3em]">
                                    AUTONOMOUS SWARM INTELLIGENCE • REAL-TIME COORDINATION • AI-POWERED RESCUE
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add custom CSS for animations */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-20px) rotate(5deg); }
                }
                
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                
                @keyframes gradient {
                    0%, 100% { opacity: 0.5; transform: rotate(0deg); }
                    50% { opacity: 0.8; transform: rotate(180deg); }
                }
                
                .animate-gradient {
                    animation: gradient 4s linear infinite;
                }
                
                .animation-delay-500 {
                    animation-delay: 500ms;
                }
                
                .animation-delay-1000 {
                    animation-delay: 1000ms;
                }
                
                .animation-delay-2000 {
                    animation-delay: 2000ms;
                }
                
                @keyframes typing {
                    from { width: 0 }
                    to { width: 100% }
                }
                
                .animate-typing {
                    animation: typing 3.5s steps(40, end), blink-caret .75s step-end infinite;
                    max-width: fit-content;
                }
                
                @keyframes blink-caret {
                    from, to { border-color: transparent }
                    50% { border-color: rgba(99, 102, 241, 0.5) }
                }
                
                .bg-grid-pattern {
                    background-image: 
                        linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
                    background-size: 50px 50px;
                }
            `}</style>
        </div>
    );
};

export default WelcomePage;