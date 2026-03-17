import React from "react";

const WelcomePage: React.FC = () => {

    const page: React.CSSProperties = {
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "linear-gradient(135deg,#0f172a,#1e293b)",
        color: "white",
        fontFamily: "Segoe UI, sans-serif"
    };

    const container: React.CSSProperties = {
        textAlign: "center",
        background: "rgba(255,255,255,0.05)",
        padding: "50px",
        borderRadius: "14px",
        backdropFilter: "blur(10px)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        width: "500px"
    };

    const title: React.CSSProperties = {
        fontSize: "42px",
        fontWeight: 700,
        marginBottom: "10px"
    };

    const subtitle: React.CSSProperties = {
        fontSize: "16px",
        opacity: 0.8,
        marginBottom: "40px",
        lineHeight: "1.5"
    };

    const buttons: React.CSSProperties = {
        display: "flex",
        justifyContent: "center",
        gap: "20px"
    };

    const button: React.CSSProperties = {
        padding: "14px 28px",
        borderRadius: "8px",
        border: "none",
        textDecoration: "none",
        color: "white",
        fontWeight: 600,
        background: "linear-gradient(135deg,#6366f1,#4f46e5)",
        cursor: "pointer",
        transition: "0.2s"
    };

    return (
        <div style={page}>
            <div style={container}>

                <div style={title}>Aegis Drone</div>

                <div style={subtitle}>
                    Autonomous Swarm Intelligence for Disaster Response.
                    Detect survivors, coordinate rescue drones, and restore hope
                    even when communication infrastructure fails.
                </div>

                <div style={buttons}>
                    <a href="/Index" style={button}>
                        Admin Dashboard
                    </a>

                    <a href="/User" style={button}>
                        Drone Contributor
                    </a>
                </div>

            </div>
        </div>
    );
};

export default WelcomePage;