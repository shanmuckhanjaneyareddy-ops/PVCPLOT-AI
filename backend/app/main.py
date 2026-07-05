from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import random
from datetime import datetime

from app.config import settings
from app.database import init_db
from app.websocket.manager import manager

# Import routers
from app.routers import auth
from app.routers import dashboard
from app.routers import production
from app.routers import inventory
from app.routers import procurement
from app.routers import machines
from app.routers import quality
from app.routers import sales
from app.routers import finance
from app.routers import energy
from app.routers import agents
from app.routers import reports
from app.routers import alerts
from app.routers import admin
from app.websocket import events
from app.models.machine import Machine, MachineSensorReading
from app.models.alert import Alert

app = FastAPI(
    title="PVCPilot AI Backend",
    description="Multi-Agent Manufacturing Intelligence Platform API",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(production.router, prefix="/api")
app.include_router(inventory.router, prefix="/api")
app.include_router(procurement.router, prefix="/api")
app.include_router(machines.router, prefix="/api")
app.include_router(quality.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(finance.router, prefix="/api")
app.include_router(energy.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(events.router)  # includes /ws

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "application": "PVCPilot AI",
        "version": "1.0.0"
    }

# Background worker loop to simulate live machine updates and broadcast WebSocket events
async def live_machine_simulator():
    await asyncio.sleep(5)  # initial delay for server startup
    while True:
        try:
            # Fetch all machines
            machines_list = await Machine.find_all().to_list()
            if machines_list:
                # Select a random extruder to update
                extruders = [m for m in machines_list if m.type == "extruder" and m.current_status == "running"]
                if extruders:
                    machine = random.choice(extruders)
                    
                    # Randomize sensor readings slightly
                    temp_change = random.uniform(-2.0, 2.0)
                    speed_change = random.uniform(-1.0, 1.0)
                    vib_change = random.uniform(-0.1, 0.1)
                    
                    machine.current_temperature_celsius = max(160.0, min(240.0, machine.current_temperature_celsius + temp_change))
                    machine.current_speed_rpm = max(20.0, min(50.0, machine.current_speed_rpm + speed_change))
                    machine.current_vibration_mm_s = max(0.5, min(8.0, machine.current_vibration_mm_s + vib_change))
                    machine.updated_at = datetime.utcnow()
                    await machine.save()

                    # Save historical reading
                    reading = MachineSensorReading(
                        machine_id=machine.id,
                        timestamp=datetime.utcnow(),
                        temperature_celsius=round(machine.current_temperature_celsius, 1),
                        speed_rpm=round(machine.current_speed_rpm, 1),
                        pressure_bar=round(machine.current_pressure_bar, 1),
                        vibration_mm_s=round(machine.current_vibration_mm_s, 2),
                        power_kw=round(machine.power_consumption_kw, 1),
                        output_kg_per_hour=machine.capacity_kg_per_hour * random.uniform(0.85, 0.95)
                    )
                    await reading.insert()

                    # Broadcast update to websocket
                    await manager.broadcast_to_topic("machine_status", {
                        "event": "machine_update",
                        "machine_code": machine.machine_code,
                        "status": machine.current_status,
                        "temp": round(machine.current_temperature_celsius, 1),
                        "speed": round(machine.current_speed_rpm, 1),
                        "vibration": round(machine.current_vibration_mm_s, 2)
                    })

                    # Simulate random anomaly and alert trigger (2% chance)
                    if random.random() < 0.02:
                        alert_msg = f"Critical vibration spike ({machine.current_vibration_mm_s:.2f} mm/s) detected on {machine.machine_code} during shift check."
                        alt = Alert(
                            alert_type="machine_fault",
                            severity="critical",
                            title=f"Sensor Anomaly on {machine.machine_code}",
                            message=alert_msg,
                            source="Sensor Monitor",
                            related_entity_id=str(machine.id),
                            related_entity_type="machine"
                        )
                        await alt.insert()
                        
                        # Broadcast alert
                        await manager.broadcast_to_topic("alerts", {
                            "event": "new_alert",
                            "severity": alt.severity,
                            "title": alt.title,
                            "message": alt.message,
                            "time": alt.created_at.isoformat()
                        })

        except Exception as e:
            print(f"Error in simulator loop: {e}")
            
        await asyncio.sleep(5)  # run simulator every 5 seconds

@app.on_event("startup")
async def on_startup():
    await init_db()
    # Run the live machine simulator in the background
    asyncio.create_task(live_machine_simulator())
