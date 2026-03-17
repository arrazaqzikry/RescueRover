import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

interface DisasterForm {
    disasterType: string;
    location: string;
    severity: string;
    affectedArea: number;
    estimatedSurvivors: number;
    description: string;
}

const CreateDisaster: React.FC = () => {
    const navigate = useNavigate();

    const [form, setForm] = useState<DisasterForm>({
        disasterType: "",
        location: "",
        severity: "Medium",
        affectedArea: 10,
        estimatedSurvivors: 5,
        description: ""
    });

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;

        setForm({
            ...form,
            [name]: name === "affectedArea" || name === "estimatedSurvivors"
                ? Number(value)
                : value
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        console.log("Disaster Created:", form);

        // store temporarily (optional)
        localStorage.setItem("disasterScenario", JSON.stringify(form));

        // redirect to dashboard
        navigate("/Index");
    };

    return (
        <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
            {/* Back Button - Top Left */}
            <div className="absolute top-6 left-6 z-10">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="group flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border/50
                             hover:bg-card hover:border-primary/30 text-foreground
                             py-2 px-4 rounded-lg font-mono text-sm transition-all duration-300
                             shadow-lg hover:shadow-primary/5"
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="group-hover:-translate-x-0.5 transition-transform"
                    >
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    <span>BACK TO DASHBOARD</span>
                </button>
            </div>

            {/* Background Decorative Elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
                <div className="absolute top-1/4 left-1/4 w-60 h-60 bg-purple-500/5 rounded-full blur-3xl" />
            </div>

            {/* Main Content */}
            <div className="relative flex items-center justify-center min-h-screen p-6">
                <div className="w-full max-w-3xl">
                    {/* Header Section */}
                    <div className="mb-8 text-center">
                        <div className="inline-flex items-center justify-center gap-2 mb-3">
                            <div className="w-1 h-6 bg-primary/50 rounded-full" />
                            <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                                NEW MISSION
                            </span>
                            <div className="w-1 h-6 bg-primary/50 rounded-full" />
                        </div>
                        <h1 className="text-4xl font-bold font-mono bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                            CREATE DISASTER SCENARIO
                        </h1>
                        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                            Configure the parameters for the search and rescue mission
                        </p>
                    </div>

                    {/* Form Card */}
                    <div className="relative group">
                        {/* Animated border gradient */}
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500" />

                        {/* Main Card */}
                        <div className="relative bg-card/90 backdrop-blur-sm border border-border/50 rounded-xl p-8 shadow-2xl">

                            <form onSubmit={handleSubmit} className="flex flex-col gap-6">

                                {/* Form Grid - 2 columns for better layout */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                                    {/* Disaster Type */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 2v4M12 22v-4M4 12H2M6 12H4M20 12h-2M22 12h-2M19.07 4.93l-2.83 2.83M4.93 19.07l2.83-2.83M19.07 19.07l-2.83-2.83M4.93 4.93l2.83 2.83"/>
                                                <circle cx="12" cy="12" r="4"/>
                                            </svg>
                                            DISASTER TYPE
                                        </label>
                                        <select
                                            name="disasterType"
                                            value={form.disasterType}
                                            onChange={handleChange}
                                            required
                                            className="w-full bg-background/50 border border-border/50 rounded-lg p-3
                                                     font-mono text-sm focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border appearance-none cursor-pointer"
                                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\' stroke=\'%23999\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                                        >
                                            <option value="" className="bg-card">Select disaster type</option>
                                            <option value="Earthquake" className="bg-card">🌍 Earthquake</option>
                                            <option value="Flood" className="bg-card">🌊 Flood</option>
                                            <option value="Wildfire" className="bg-card">🔥 Wildfire</option>
                                            <option value="Building Collapse" className="bg-card">🏗️ Building Collapse</option>
                                            <option value="Hurricane" className="bg-card">🌀 Hurricane</option>
                                        </select>
                                    </div>

                                    {/* Location */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                                <circle cx="12" cy="10" r="3"/>
                                            </svg>
                                            LOCATION
                                        </label>
                                        <input
                                            type="text"
                                            name="location"
                                            value={form.location}
                                            onChange={handleChange}
                                            required
                                            placeholder="e.g., Downtown, 40.7128° N, 74.0060° W"
                                            className="w-full bg-background/50 border border-border/50 rounded-lg p-3
                                                     font-mono text-sm placeholder:text-muted-foreground/50
                                                     focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border"
                                        />
                                    </div>

                                    {/* Severity */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                                            </svg>
                                            SEVERITY LEVEL
                                        </label>
                                        <select
                                            name="severity"
                                            value={form.severity}
                                            onChange={handleChange}
                                            className="w-full bg-background/50 border border-border/50 rounded-lg p-3
                                                     font-mono text-sm focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border appearance-none cursor-pointer"
                                            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\' stroke=\'%23999\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'M6 8l4 4 4-4\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                                        >
                                            <option value="Low" className="bg-card">🟢 Low</option>
                                            <option value="Medium" className="bg-card">🟡 Medium</option>
                                            <option value="High" className="bg-card">🟠 High</option>
                                            <option value="Critical" className="bg-card">🔴 Critical</option>
                                        </select>
                                    </div>

                                    {/* Affected Area */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                                <line x1="3" y1="9" x2="21" y2="9"/>
                                                <line x1="3" y1="15" x2="21" y2="15"/>
                                                <line x1="9" y1="21" x2="9" y2="9"/>
                                            </svg>
                                            AFFECTED AREA (km²)
                                        </label>
                                        <input
                                            type="number"
                                            name="affectedArea"
                                            value={form.affectedArea}
                                            onChange={handleChange}
                                            min="1"
                                            className="w-full bg-background/50 border border-border/50 rounded-lg p-3
                                                     font-mono text-sm focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border"
                                        />
                                    </div>

                                    {/* Estimated Survivors */}
                                    <div className="space-y-2 md:col-span-2">
                                        <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                                <circle cx="9" cy="7" r="4"/>
                                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                            </svg>
                                            ESTIMATED SURVIVORS
                                        </label>
                                        <input
                                            type="number"
                                            name="estimatedSurvivors"
                                            value={form.estimatedSurvivors}
                                            onChange={handleChange}
                                            min="1"
                                            className="w-full bg-background/50 border border-border/50 rounded-lg p-3
                                                     font-mono text-sm focus:border-primary/50 focus:outline-none
                                                     focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                     hover:border-border"
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                        </svg>
                                        SITUATION REPORT
                                    </label>
                                    <textarea
                                        name="description"
                                        rows={4}
                                        value={form.description}
                                        onChange={handleChange}
                                        placeholder="Describe the current situation, critical areas, and any immediate concerns..."
                                        className="w-full bg-background/50 border border-border/50 rounded-lg p-3
                                                 font-mono text-sm placeholder:text-muted-foreground/50
                                                 focus:border-primary/50 focus:outline-none
                                                 focus:ring-2 focus:ring-primary/20 transition-all duration-300
                                                 hover:border-border resize-none"
                                    />
                                </div>

                                {/* Stats Preview */}
                                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold font-mono text-primary">
                                            {form.affectedArea || 0}
                                        </div>
                                        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
                                            KM² TO SEARCH
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold font-mono text-primary">
                                            {form.estimatedSurvivors || 0}
                                        </div>
                                        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
                                            POTENTIAL SURVIVORS
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold font-mono" style={{
                                            color: form.severity === 'Critical' ? '#EF4444' :
                                                form.severity === 'High' ? '#F59E0B' :
                                                    form.severity === 'Medium' ? '#EAB308' : '#10B981'
                                        }}>
                                            {form.severity}
                                        </div>
                                        <div className="text-[10px] font-mono text-muted-foreground tracking-wider">
                                            SEVERITY LEVEL
                                        </div>
                                    </div>
                                </div>

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    className="group relative mt-4 bg-primary hover:bg-primary/90 text-primary-foreground
                                             py-4 rounded-lg font-mono text-sm font-semibold
                                             transition-all duration-300 overflow-hidden
                                             focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                    <span className="relative z-10 flex items-center justify-center gap-2">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:rotate-90 transition-transform duration-300">
                                            <path d="M12 5v14M5 12h14"/>
                                        </svg>
                                        INITIALIZE MISSION
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="group-hover:translate-x-1 transition-transform">
                                            <path d="M5 12h14M12 5l7 7-7 7"/>
                                        </svg>
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Footer Note */}
                    <div className="mt-6 text-center">
                        <p className="text-[10px] font-mono text-muted-foreground/50 tracking-wider">
                            SYSTEM READY • CONFIGURE RESCUE PARAMETERS • INITIATE SEARCH PROTOCOL
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateDisaster;