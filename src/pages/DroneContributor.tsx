import React, { useState } from "react";

const RegisterDrone: React.FC = () => {

    const [droneId, setDroneId] = useState<string>("");
    const [name, setName] = useState<string>("");
    const [battery, setBattery] = useState<number | "">("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!droneId || !name || battery === "") {
            alert("Please fill in all fields.");
            return;
        }

        const droneData = {
            droneId,
            name,
            battery
        };

        console.log("Drone Registered:", droneData);

        alert("Drone registration successful");

        setDroneId("");
        setName("");
        setBattery("");
    };

    return (
        <div style={pageStyle}>

            <a href="/" style={backButton}>
                ← Back
            </a>

            <div style={card}>

                <h2 style={{ textAlign: "center" }}>Register Drone</h2>

                <form onSubmit={handleSubmit}>

                    <input
                        style={inputStyle}
                        type="text"
                        placeholder="Drone ID"
                        value={droneId}
                        onChange={(e) => setDroneId(e.target.value)}
                        required
                    />

                    <input
                        style={inputStyle}
                        type="text"
                        placeholder="Drone Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                    />

                    <input
                        style={inputStyle}
                        type="number"
                        placeholder="Battery (%)"
                        value={battery}
                        onChange={(e) =>
                            setBattery(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        min="0"
                        max="100"
                        required
                    />

                    <button style={buttonStyle} type="submit">
                        Register Drone
                    </button>

                </form>

            </div>
        </div>
    );
};

const pageStyle: React.CSSProperties = {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg,#0f172a,#1e293b)",
    fontFamily: "Segoe UI, sans-serif",
    color: "white"
};

const card: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    padding: "40px",
    borderRadius: "12px",
    width: "420px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
};

const backButton: React.CSSProperties = {
    position: "absolute",
    top: "30px",
    left: "30px",
    textDecoration: "none",
    color: "white",
    fontWeight: 600,
    fontSize: "16px",
    padding: "10px 16px",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.1)"
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    marginBottom: "18px",
    borderRadius: "6px",
    border: "none",
    outline: "none",
    fontSize: "14px",
    color: "black",
    background: "rgba(255,255,255,0.9)"
};

const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg,#6366f1,#4f46e5)",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "15px"
};

export default RegisterDrone;