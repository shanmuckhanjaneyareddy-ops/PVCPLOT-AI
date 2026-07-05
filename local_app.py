import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import time
import json
import asyncio
import random
import io
from datetime import datetime, timedelta
import threading

app = FastAPI(
    title="PVCPilot AI - Local Platform Host",
    description="Unified Mock Database and Interactive Dashboard Engine for local testing",
    version="1.0.0"
)

# --- 1. LOCAL MEMORY DATABASE STATE (No external MongoDB/Redis required) ---
session_user = None

# Mock database records
users = {
    "owner@pvcpilot.com": {"email": "owner@pvcpilot.com", "role": "factory_owner", "full_name": "Rajesh Kumar", "department": "Management"},
    "manager@pvcpilot.com": {"email": "manager@pvcpilot.com", "role": "plant_manager", "full_name": "Suresh Reddy", "department": "Production"}
}

machines = [
    {"id": "m1", "machine_code": "EXT-01", "name": "Twin Screw Extruder 63mm", "type": "extruder", "current_status": "running", "health_score": 85.0, "oee": 79.5, "current_temperature_celsius": 182.4, "current_speed_rpm": 32.5, "current_vibration_mm_s": 2.1, "location": "Line 1"},
    {"id": "m2", "machine_code": "EXT-02", "name": "Twin Screw Extruder 90mm", "type": "extruder", "current_status": "running", "health_score": 88.0, "oee": 82.1, "current_temperature_celsius": 188.1, "current_speed_rpm": 35.0, "current_vibration_mm_s": 2.4, "location": "Line 2"},
    {"id": "m3", "machine_code": "EXT-03", "name": "Twin Screw Extruder 110mm", "type": "extruder", "current_status": "idle", "health_score": 92.0, "oee": 85.0, "current_temperature_celsius": 170.0, "current_speed_rpm": 0.0, "current_vibration_mm_s": 0.5, "location": "Line 3"},
    {"id": "m4", "machine_code": "EXT-04", "name": "Twin Screw Extruder 160mm", "type": "extruder", "current_status": "running", "health_score": 82.0, "oee": 78.2, "current_temperature_celsius": 191.5, "current_speed_rpm": 31.2, "current_vibration_mm_s": 2.8, "location": "Line 4"},
    {"id": "m5", "machine_code": "EXT-05", "name": "Twin Screw Extruder High-Speed", "type": "extruder", "current_status": "running", "health_score": 87.0, "oee": 84.5, "current_temperature_celsius": 185.0, "current_speed_rpm": 40.0, "current_vibration_mm_s": 1.9, "location": "Line 5"},
    {"id": "m6", "machine_code": "EXT-06", "name": "Twin Screw Extruder Heavy-Duty", "type": "extruder", "current_status": "fault", "health_score": 42.0, "oee": 0.0, "current_temperature_celsius": 242.0, "current_speed_rpm": 0.0, "current_vibration_mm_s": 7.6, "location": "Line 6"}
]

# Past 30 points of sensor logs for charts
machine_sensors = {
    m["id"]: [
        {
            "timestamp": (datetime.utcnow() - timedelta(minutes=(30-i)*10)).isoformat(),
            "temperature_celsius": round(180.0 + random.uniform(-5, 5) if m["current_status"] != "fault" else 240.0, 1),
            "vibration_mm_s": round(2.0 + random.uniform(-0.5, 0.5) if m["current_status"] != "fault" else 7.5, 2),
            "pressure_bar": round(140.0 + random.uniform(-10, 10), 1)
        } for i in range(30)
    ] for m in machines
}

raw_materials = [
    {"id": "rm1", "sku": "RM-PVC-K67", "name": "PVC Resin K67", "category": "resin", "unit": "kg", "current_stock": 8500.0, "reorder_level": 10000.0, "unit_cost": 85.0, "location": "Zone-A1"},
    {"id": "rm2", "sku": "RM-PVC-K57", "name": "PVC Resin K57", "category": "resin", "unit": "kg", "current_stock": 12000.0, "reorder_level": 8000.0, "unit_cost": 90.0, "location": "Zone-A2"},
    {"id": "rm3", "sku": "RM-STB-LAD", "name": "Lead Stabilizer (One Pack)", "category": "stabilizer", "unit": "kg", "current_stock": 2300.0, "reorder_level": 3000.0, "unit_cost": 150.0, "location": "Zone-B1"},
    {"id": "rm4", "sku": "RM-FLR-CACO3", "name": "Calcium Carbonate (CaCO3)", "category": "filler", "unit": "kg", "current_stock": 15600.0, "reorder_level": 5000.0, "unit_cost": 18.0, "location": "Zone-D1"}
]

finished_goods = [
    {"sku": "FG-PIPE-63-PN10", "product_name": "uPVC Pipe 63mm PN10", "pipe_diameter_mm": 63, "available_quantity_meters": 12400.0, "unit_price": 95.0},
    {"sku": "FG-PIPE-90-PN10", "product_name": "uPVC Pipe 90mm PN10", "pipe_diameter_mm": 90, "available_quantity_meters": 9600.0, "unit_price": 140.0},
    {"sku": "FG-PIPE-110-PN10", "product_name": "uPVC Pipe 110mm PN10", "pipe_diameter_mm": 110, "available_quantity_meters": 7800.0, "unit_price": 195.0}
]

work_orders = [
    {"id": "wo1", "order_number": "WO-20260630-0001", "pipe_diameter_mm": 110, "pressure_class": "PN10", "quantity_meters": 3000.0, "produced_meters": 1200.0, "machine_id": "m2", "shift": "morning", "status": "in_progress", "priority": "high"},
    {"id": "wo2", "order_number": "WO-20260630-0002", "pipe_diameter_mm": 90, "pressure_class": "PN10", "quantity_meters": 5000.0, "produced_meters": 0.0, "machine_id": "m1", "shift": "morning", "status": "scheduled", "priority": "medium"},
    {"id": "wo3", "order_number": "WO-20260630-0003", "pipe_diameter_mm": 63, "pressure_class": "PN10", "quantity_meters": 2000.0, "produced_meters": 0.0, "machine_id": "m3", "shift": "afternoon", "status": "draft", "priority": "low"}
]

alerts = [
    {"id": "alt1", "alert_type": "machine_fault", "severity": "critical", "title": "EXT-06 Sensor Anomaly", "message": "High vibration (7.6mm/s) and motor temperature spike (242 C) detected on heavy extruder Line 6.", "source": "Telemetry Guard", "is_acknowledged": False, "time": datetime.utcnow().isoformat()},
    {"id": "alt2", "alert_type": "low_stock", "severity": "high", "title": "Lead Stabilizer Below safety levels", "message": "Lead Stabilizer stock is 2,300 kg (safety trigger: 3,000 kg). Out-of-stock risk in 4 days.", "source": "Inventory Agent", "is_acknowledged": False, "time": datetime.utcnow().isoformat()}
]

# --- 2. LIVE SIMULATION LOOP IN PYTHON BACKGROUND THREAD ---
def update_machine_telemetry():
    while True:
        try:
            # Randomly update active machines values
            for m in machines:
                if m["current_status"] == "running":
                    temp_change = random.uniform(-1.5, 1.5)
                    vib_change = random.uniform(-0.1, 0.1)
                    
                    m["current_temperature_celsius"] = round(max(160.0, min(240.0, m["current_temperature_celsius"] + temp_change)), 1)
                    m["current_vibration_mm_s"] = round(max(0.5, min(8.0, m["current_vibration_mm_s"] + vib_change)), 2)
                    
                    # Update sensor arrays
                    hist = machine_sensors[m["id"]]
                    hist.pop(0)
                    hist.append({
                        "timestamp": datetime.utcnow().isoformat(),
                        "temperature_celsius": m["current_temperature_celsius"],
                        "vibration_mm_s": m["current_vibration_mm_s"],
                        "pressure_bar": round(140.0 + random.uniform(-5, 5), 1)
                    })
                    
            # Update work orders progress
            for wo in work_orders:
                if wo["status"] == "in_progress":
                    wo["produced_meters"] = min(wo["quantity_meters"], wo["produced_meters"] + random.randint(15, 35))
                    if wo["produced_meters"] == wo["quantity_meters"]:
                        wo["status"] = "completed"
        except Exception as e:
            print(f"Telemetry simulation error: {e}")
        time.sleep(4)

thread = threading.Thread(target=update_machine_telemetry, daemon=True)
thread.start()

# --- 3. FASTAPI ENDPOINT DIAGNOSTICS & LOGISTICS API ---
class LoginModel(BaseModel):
    email: str
    password: str

class WorkOrderCreate(BaseModel):
    pipe_diameter_mm: int
    pressure_class: str
    quantity_meters: float
    machine_id: str
    shift: str
    priority: str

@app.post("/api/auth/login")
async def login_api(creds: LoginModel):
    user_rec = users.get(creds.email)
    if not user_rec or creds.password != "PVCPilot@2025":
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    global session_user
    session_user = user_rec
    return {
        "access_token": "dummy_token_12345",
        "email": user_rec["email"],
        "role": user_rec["role"],
        "full_name": user_rec["full_name"]
    }

@app.get("/api/dashboard/overview")
async def get_dashboard_overview():
    today_prod = sum(wo["produced_meters"] for wo in work_orders)
    active_count = sum(1 for wo in work_orders if wo["status"] in ["scheduled", "in_progress"])
    
    # 15 days production chart simulation
    prod_chart = []
    today = datetime.utcnow()
    for i in range(15):
        prod_chart.append({
            "date": (today - timedelta(days=14-i)).strftime("%b %d"),
            "planned": random.randint(3500, 5000),
            "actual": random.randint(3200, 4800)
        })

    return {
        "kpis": {
            "todays_production_tons": round((today_prod * 1.5) / 1000.0, 1) or 12.4,
            "active_work_orders": active_count or 8,
            "machine_uptime_pct": 87.3,
            "raw_material_stock_days": 14,
            "revenue_mtd_lakhs": 48.2,
            "quality_pass_rate_pct": 96.1,
            "open_alerts": len([a for a in alerts if not a["is_acknowledged"]]),
            "energy_today_kwh": 1840.0
        },
        "production_chart": prod_chart,
        "machine_statuses": machines,
        "top_alerts": [a for a in alerts if not a["is_acknowledged"]],
        "ai_recommendations": []
    }

@app.get("/api/inventory/raw-materials")
async def get_raw_materials():
    return raw_materials

@app.get("/api/inventory/finished-goods")
async def get_finished_goods():
    return finished_goods

@app.get("/api/production/work-orders")
async def get_work_orders():
    return work_orders

@app.post("/api/production/work-orders")
async def create_work_order(wo: WorkOrderCreate):
    count = len(work_orders)
    wo_num = f"WO-20260630-{(count+1):04d}"
    new_wo = {
        "id": f"wo{count+1}",
        "order_number": wo_num,
        "pipe_diameter_mm": wo.pipe_diameter_mm,
        "pressure_class": wo.pressure_class,
        "quantity_meters": wo.quantity_meters,
        "produced_meters": 0.0,
        "machine_id": wo.machine_id,
        "shift": wo.shift,
        "status": "draft",
        "priority": wo.priority
    }
    work_orders.append(new_wo)
    return new_wo

@app.patch("/api/production/work-orders/{id}/status")
async def update_wo_status(id: str, status_str: str):
    for wo in work_orders:
        if wo["id"] == id:
            wo["status"] = status_str
            return wo
    raise HTTPException(status_code=404, detail="Work order not found")

@app.get("/api/machines/{id}/sensors")
async def get_sensors(id: str):
    return machine_sensors.get(id, [])

@app.get("/api/machines/{id}/oee")
async def get_oee(id: str):
    return {
        "availability": 92.5 if id != "m6" else 0.0,
        "performance": 88.0 if id != "m6" else 0.0,
        "quality": 98.2 if id != "m6" else 0.0,
        "oee": 79.9 if id != "m6" else 0.0
    }

@app.get("/api/alerts")
async def get_alerts():
    return alerts

@app.patch("/api/alerts/{id}/acknowledge")
async def ack_alert(id: str):
    for a in alerts:
        if a["id"] == id:
            a["is_acknowledged"] = True
            return a
    raise HTTPException(status_code=404, detail="Alert not found")

@app.get("/api/finance/cost-breakdown")
async def get_cost_breakdown():
    return {
        "raw_material": 1820000.0,
        "energy": 450000.0,
        "labor": 320000.0,
        "overhead": 250000.0,
        "maintenance": 180000.0,
        "logistics": 150000.0
    }

# --- 4. STREAMING SSE AI AGENT COORDINATOR CHAT ---
class ChatRequest(BaseModel):
    message: str

@app.post("/api/agents/chat")
async def chat_agents(req: ChatRequest):
    msg_lower = req.message.lower()
    
    # Simple rule responder mapping to PVC topics
    analysis = "Operational data logs show nominal ranges across primary twinscrew extruders."
    recs = "- Retain standard shift configurations."
    risks = "- Minimal system hazards identified."
    steps = "- Keep observing live sensor feeds."
    
    if "machine" in msg_lower or "extruder" in msg_lower or "oee" in msg_lower or "fault" in msg_lower:
        analysis = "OEE metrics flag EXT-06 heavy-duty extruder line in a FAULT state due to motor friction thermal levels."
        recs = "- Re-assign scheduled 160mm pipe extrusion batches to kabra EXT-04 unit.\n- Initiate motor maintenance checklist."
        risks = "- Overheating can result in severe gear assembly deformation."
        steps = "- Request technician Ramu to inspect EXT-06 power inputs (Maintenance Floor)."
    elif "inventory" in msg_lower or "stock" in msg_lower or "resin" in msg_lower or "stabilizer" in msg_lower:
        analysis = "Lead Stabilizer (One Pack) inventory stands at 2,300 kg, triggering the safety reorder limit of 3,000 kg."
        recs = "- Send immediate reorder draft for 5,000 kg from Bodal Chemicals."
        risks = "- Exhaustion risk in 4 days if delivery lead time delays occur."
        steps = "- Confirm supplier payment terms and release purchase order (Procurement Dept)."
    elif "alert" in msg_lower or "critical" in msg_lower:
        analysis = "One critical alert logged (EXT-06 vibration anomaly) and one warning logged (low Lead Stabilizer stock)."
        recs = "- Acknowledge warnings on the notifications pane to notify supervisors."
        risks = "- Excessive unread alarms delay response speed on plant breakdowns."
        steps = "- Open alerts screen and sign off resolved checks (Supervisor Duty)."

    response_text = f"""### Analysis
{analysis}

### Recommendations
{recs}

### Risks
{risks}

### Next Steps
{steps}
"""

    async def sse_generator():
        # Stream chunks back
        chunk_size = 12
        for i in range(0, len(response_text), chunk_size):
            chunk = response_text[i:i+chunk_size]
            yield f"data: {json.dumps({'text': chunk})}\n\n"
            await asyncio.sleep(0.01)
        yield "data: [DONE]\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

# --- 5. REPORT DOWNLOAD CHANNELS ---
class ReportRequest(BaseModel):
    report_type: str
    format: str

@app.post("/api/reports/generate")
async def generate_report_api(req: ReportRequest):
    output = io.StringIO()
    output.write("PVCPilot AI - Operational Report Summary\n")
    output.write("PVCPilot AI Report\n\n")
    output.write("Metric Name,Value\n")
    output.write("Total Extruded Tons,12.4\n")
    output.write("Active Work Orders,8\n")
    output.write("Machine OEE Average,87.3%\n")
    output.write("Lead Stabilizer Stock,2300 kg\n")
    
    csv_bytes = io.BytesIO(output.getvalue().encode('utf-8'))
    return StreamingResponse(
        csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=PVCPilot_Report_{req.report_type}.csv"}
    )

# --- 6. FRONTEND LANDING DASHBOARD UI INTERACTION HTML ---
@app.get("/", response_class=HTMLResponse)
async def serve_dashboard():
    # Load HTML code directly as a single page app script
    html_content = """
    <!DOCTYPE html>
    <html lang="en" class="dark">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>PVCPilot AI — Multi-Agent Manufacturing Intelligence</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <!-- Font family -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
        <!-- Chart.js for graphs -->
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <!-- Icon library -->
        <script src="https://unpkg.com/lucide@latest"></script>
        <script>
            tailwind.config = {
                darkMode: 'class',
                theme: {
                    extend: {
                        colors: {
                            background: '#09090b',
                            foreground: '#fafafa',
                            card: '#18181b',
                            border: '#27272a',
                            primary: '#0ea5e9',
                            accent: '#f97316',
                            muted: '#71717a'
                        }
                    }
                }
            }
        </script>
        <style>
            body { font-family: 'Inter', sans-serif; }
            .font-mono { font-family: 'JetBrains Mono', monospace; }
        </style>
    </head>
    <body class="bg-background text-foreground min-h-screen flex flex-col transition-colors duration-300">
        <div id="app" class="flex flex-col min-h-screen"></div>

        <script>
            // --- STATE MANAGEMENT ---
            let state = {
                isAuthenticated: false,
                activeTab: 'dashboard',
                sidebarOpen: true,
                theme: 'dark',
                kpis: {
                    todays_production_tons: 12.4,
                    active_work_orders: 8,
                    machine_uptime_pct: 87.3,
                    raw_material_stock_days: 14,
                    revenue_mtd_lakhs: 48.2,
                    quality_pass_rate_pct: 96.1,
                    open_alerts: 2,
                    energy_today_kwh: 1840
                },
                machines: [],
                alerts: [],
                workOrders: [],
                chatHistory: [
                    {sender: 'agent', text: 'Hello! I am the Coordinator Agent. I am here to help monitor and optimize your PVC pipe factory. Ask me anything about OEE, inventory reorders, OEE anomalies, raw materials, or daily scheduling.'}
                ],
                isStreaming: false,
                showNewWOModal: false,
                selectedMachineId: 'm1'
            };

            // Fetch live API data helper
            const defCall = async (url, options = {}) => {
                try {
                    const res = await fetch(url, options);
                    return await res.json();
                } catch(e) {
                    console.error("API Call error:", e);
                }
            };

            // Render view trigger
            const render = () => {
                const appDiv = document.getElementById("app");
                
                if (!state.isAuthenticated) {
                    appDiv.innerHTML = renderLogin();
                    return;
                }
                
                appDiv.innerHTML = `
                    <div class="flex flex-col min-h-screen">
                        ${renderHeader()}
                        <div class="flex flex-1 relative">
                            ${renderSidebar()}
                            <main class="flex-1 p-6 overflow-y-auto bg-background flex flex-col gap-6">
                                ${renderActiveTab()}
                                <footer class="mt-auto py-4 border-t border-border bg-card/10">
                                    <p class="text-[10px] text-muted text-center">PVCPilot AI © 2026</p>
                                </footer>
                            </main>
                        </div>
                        ${renderWOModal()}
                    </div>
                `;
                
                lucide.createIcons();
                initCharts();
            };

            // LOGIN COMPONENT
            const renderLogin = () => `
                <div class="min-h-screen bg-zinc-950 text-white flex items-center justify-center relative overflow-hidden px-4">
                    <div class="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl relative z-10">
                        <div class="flex flex-col items-center mb-8">
                            <div class="h-16 w-16 bg-sky-500/20 text-sky-400 flex items-center justify-center rounded-2xl mb-4 border border-sky-500/30 shadow-lg">
                                <i data-lucide="factory" class="h-9 w-9"></i>
                            </div>
                            <h1 class="text-2xl font-bold tracking-tight">PVCPilot AI</h1>
                            <p class="text-sm text-zinc-400 mt-1">Multi-Agent Manufacturing Intelligence</p>
                        </div>
                        <div class="space-y-4">
                            <div>
                                <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Email Address</label>
                                <input id="email" type="email" value="owner@pvcpilot.com" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-white" />
                            </div>
                            <div>
                                <label class="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Password</label>
                                <input id="password" type="password" value="PVCPilot@2025" class="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sky-500 text-white" />
                            </div>
                            <button onclick="handleLoginSubmit()" class="w-full bg-sky-500 hover:bg-sky-600 text-zinc-950 font-semibold rounded-lg py-3 mt-6 transition-all shadow-lg hover:shadow-sky-500/20">
                                Authenticate Platform
                            </button>
                        </div>
                        <div class="mt-8 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-500">
                            PVCPilot AI © 2026
                        </div>
                    </div>
                </div>
            `;

            // HEADER COMPONENT
            const renderHeader = () => `
                <header class="h-16 border-b border-border bg-card/85 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
                    <div class="flex items-center gap-4">
                        <button onclick="toggleSidebarState()" class="p-2 hover:bg-zinc-800 rounded-lg text-muted hover:text-foreground">
                            <i data-lucide="menu" class="h-5 w-5"></i>
                        </button>
                        <div class="flex items-center gap-2">
                            <i data-lucide="factory" class="text-primary h-6 w-6"></i>
                            <span class="font-bold tracking-tight text-lg">PVCPilot AI</span>
                        </div>
                        <span class="h-4 w-px bg-border hidden sm:block"></span>
                        <span class="text-[10px] font-mono bg-sky-500/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 hidden sm:block">
                            ● Local API Active
                        </span>
                    </div>
                    <div class="flex items-center gap-4">
                        <button onclick="toggleTheme()" class="p-2 text-muted hover:text-foreground hover:bg-zinc-800 rounded-lg">
                            <i data-lucide="${state.theme === 'dark' ? 'sun' : 'moon'}" class="h-5 w-5"></i>
                        </button>
                        <button onclick="handleLogout()" class="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                            <i data-lucide="log-out" class="h-5 w-5"></i>
                        </button>
                    </div>
                </header>
            `;

            // SIDEBAR COMPONENT
            const renderSidebar = () => `
                <aside class="bg-card border-r border-border transition-all duration-300 flex flex-col shrink-0 sticky top-16 h-[calc(100vh-64px)] z-30 ${state.sidebarOpen ? 'w-64' : 'w-16'}">
                    <div class="flex-1 py-6 overflow-y-auto px-3 space-y-4">
                        <div>
                            ${state.sidebarOpen ? '<p class="text-[10px] uppercase font-bold tracking-widest text-muted px-3 mb-2">Main Controls</p>' : ''}
                            <nav class="space-y-1">
                                <button onclick="setTab('dashboard')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${state.activeTab === 'dashboard' ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary' : 'text-muted hover:text-foreground hover:bg-zinc-800' }">
                                    <i data-lucide="factory" class="h-5 w-5"></i>
                                    ${state.sidebarOpen ? '<span>Dashboard</span>' : ''}
                                </button>
                                <button onclick="setTab('production')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${state.activeTab === 'production' ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary' : 'text-muted hover:text-foreground hover:bg-zinc-800' }">
                                    <i data-lucide="clipboard-list" class="h-5 w-5"></i>
                                    ${state.sidebarOpen ? '<span>Production Board</span>' : ''}
                                </button>
                                <button onclick="setTab('machines')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${state.activeTab === 'machines' ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary' : 'text-muted hover:text-foreground hover:bg-zinc-800' }">
                                    <i data-lucide="settings-2" class="h-5 w-5"></i>
                                    ${state.sidebarOpen ? '<span>Machines OEE</span>' : ''}
                                </button>
                            </nav>
                        </div>
                        <div>
                            ${state.sidebarOpen ? '<p class="text-[10px] uppercase font-bold tracking-widest text-muted px-3 mb-2">AI Diagnostics</p>' : ''}
                            <nav class="space-y-1">
                                <button onclick="setTab('agents')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${state.activeTab === 'agents' ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary' : 'text-muted hover:text-foreground hover:bg-zinc-800' }">
                                    <i data-lucide="brain" class="h-5 w-5"></i>
                                    ${state.sidebarOpen ? '<span>Ask AI Agents</span>' : ''}
                                </button>
                                <button onclick="setTab('reports')" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${state.activeTab === 'reports' ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary' : 'text-muted hover:text-foreground hover:bg-zinc-800' }">
                                    <i data-lucide="file-text" class="h-5 w-5"></i>
                                    ${state.sidebarOpen ? '<span>Reports Builder</span>' : ''}
                                </button>
                            </nav>
                        </div>
                    </div>
                    <div class="py-4 border-t border-border text-center">
                        <p class="text-[10px] text-muted font-medium">${state.sidebarOpen ? 'PVCPilot AI' : 'PVC'}</p>
                    </div>
                </aside>
            `;

            // TABS COMPONENT MAPPING
            const renderActiveTab = () => {
                switch(state.activeTab) {
                    case 'dashboard': return renderDashboard();
                    case 'production': return renderProduction();
                    case 'machines': return renderMachinesView();
                    case 'agents': return renderAgentsChat();
                    case 'reports': return renderReportsBuilder();
                    default: return renderDashboard();
                }
            };

            // TAB 1: MAIN DASHBOARD VIEW
            const renderDashboard = () => `
                <div class="space-y-6">
                    <div>
                        <h2 class="text-xl font-bold tracking-tight">Factory Control Dashboard</h2>
                        <p class="text-xs text-muted">Here is your live manufacturing summary.</p>
                    </div>

                    <!-- KPI Cards Strip -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
                            <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Today's Production</p>
                            <h3 class="text-xl font-bold font-mono mt-2">${state.kpis.todays_production_tons} Tons</h3>
                            <p class="text-[10px] text-green-500 font-semibold mt-1">▲ 2.1% vs yesterday</p>
                        </div>
                        <div class="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
                            <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Active Work Orders</p>
                            <h3 class="text-xl font-bold font-mono mt-2">${state.kpis.active_work_orders} Orders</h3>
                            <p class="text-[10px] text-primary font-semibold mt-1">Operational</p>
                        </div>
                        <div class="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
                            <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Machine Uptime</p>
                            <h3 class="text-xl font-bold font-mono mt-2">${state.kpis.machine_uptime_pct}%</h3>
                            <p class="text-[10px] text-green-500 font-semibold mt-1">▲ 0.4% OEE trend</p>
                        </div>
                        <div class="bg-card border border-border p-4 rounded-xl relative overflow-hidden">
                            <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Raw Material Stock</p>
                            <h3 class="text-xl font-bold font-mono mt-2">${state.kpis.raw_material_stock_days} Days</h3>
                            <p class="text-[10px] text-orange-500 font-semibold mt-1">Lead: warnings active</p>
                        </div>
                    </div>

                    <!-- Chart Grid -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="bg-card border border-border p-6 rounded-xl lg:col-span-2">
                            <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">Production Overview (Meters)</h3>
                            <div class="h-64 relative"><canvas id="prodChart"></canvas></div>
                        </div>
                        <div class="bg-card border border-border p-6 rounded-xl">
                            <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">Live Machine Grid</h3>
                            <div class="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                                ${state.machines.map(m => `
                                    <div onclick="setSelectedMachine('${m.id}')" class="bg-background border border-border p-3 rounded-lg hover:border-primary transition-all cursor-pointer">
                                        <span class="text-xs font-semibold">${m.machine_code}</span>
                                        <div class="flex items-center gap-1.5 mt-2">
                                            <span class="h-2 w-2 rounded-full ${m.current_status === 'running' ? 'bg-green-500 animate-pulse' : m.current_status === 'fault' ? 'bg-red-500' : 'bg-amber-500'}"></span>
                                            <span class="text-[9px] uppercase font-mono text-muted">${m.current_status}</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <!-- P&L Cost Breakdown -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-card border border-border p-6 rounded-xl">
                            <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">Production Cost Breakdown</h3>
                            <div class="h-48 relative"><canvas id="costChart"></canvas></div>
                        </div>
                        <div class="bg-card border border-border p-6 rounded-xl flex flex-col justify-between">
                            <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">Diagnostics AI Recommendations</h3>
                            <div class="space-y-3 flex-1 overflow-y-auto">
                                <div class="bg-background border-l-4 border-red-500 p-3 rounded-r-lg">
                                    <span class="text-[9px] font-bold text-red-500 uppercase font-mono">Machine Agent</span>
                                    <p class="text-xs font-medium mt-1">High vibration alert detected on Extruder EXT-06. Production run on Line 6 halted.</p>
                                </div>
                                <div class="bg-background border-l-4 border-orange-500 p-3 rounded-r-lg">
                                    <span class="text-[9px] font-bold text-orange-500 uppercase font-mono">Inventory Agent</span>
                                    <p class="text-xs font-medium mt-1">Lead Stabilizer stock drops to 2,300 kg (safety threshold: 3,000 kg).</p>
                                </div>
                            </div>
                            <button onclick="setTab('agents')" class="bg-primary text-zinc-950 text-xs font-bold py-2 rounded-lg mt-4 flex items-center justify-center gap-1.5 hover:bg-sky-400">
                                <i data-lucide="brain" class="h-4 w-4"></i> Ask Coordinator Agent
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // TAB 2: PRODUCTION KANBAN VIEW
            const renderProduction = () => `
                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h2 class="text-xl font-bold tracking-tight">Production Scheduler Board</h2>
                            <p class="text-xs text-muted">Manage and track work order batches across extruders.</p>
                        </div>
                        <button onclick="toggleWOModal(true)" class="bg-primary text-zinc-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 hover:bg-sky-400">
                            <i data-lucide="plus" class="h-4 w-4"></i> New Work Order
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <!-- DRAFT -->
                        <div class="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[300px]">
                            <h3 class="text-xs font-bold uppercase tracking-wider text-muted border-b border-border pb-2 mb-3">Draft</h3>
                            <div class="space-y-3 flex-1">
                                ${state.workOrders.filter(w => w.status === 'draft').map(wo => `
                                    <div class="bg-background border border-border p-3 rounded-lg space-y-2">
                                        <span class="text-[9px] font-mono text-muted">${wo.order_number}</span>
                                        <h4 class="text-xs font-bold">uPVC Pipe ${wo.pipe_diameter_mm}mm</h4>
                                        <div class="text-[9px] text-muted">Meters: ${wo.quantity_meters}m</div>
                                        <button onclick="updateWOStatus('${wo.id}', 'scheduled')" class="w-full bg-primary/10 hover:bg-primary/20 text-primary text-[10px] py-1 rounded font-semibold">Schedule Run</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- SCHEDULED -->
                        <div class="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[300px]">
                            <h3 class="text-xs font-bold uppercase tracking-wider text-muted border-b border-border pb-2 mb-3">Scheduled</h3>
                            <div class="space-y-3 flex-1">
                                ${state.workOrders.filter(w => w.status === 'scheduled').map(wo => `
                                    <div class="bg-background border border-border p-3 rounded-lg space-y-2">
                                        <span class="text-[9px] font-mono text-muted">${wo.order_number}</span>
                                        <h4 class="text-xs font-bold">uPVC Pipe ${wo.pipe_diameter_mm}mm</h4>
                                        <button onclick="updateWOStatus('${wo.id}', 'in_progress')" class="w-full bg-green-500/10 hover:bg-green-500/20 text-green-500 text-[10px] py-1 rounded font-semibold">Start Extruder</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- IN PROGRESS -->
                        <div class="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[300px]">
                            <h3 class="text-xs font-bold uppercase tracking-wider text-muted border-b border-border pb-2 mb-3">In Progress</h3>
                            <div class="space-y-3 flex-1">
                                ${state.workOrders.filter(w => w.status === 'in_progress').map(wo => `
                                    <div class="bg-background border border-border p-3 rounded-lg space-y-2">
                                        <span class="text-[9px] font-mono text-muted">${wo.order_number}</span>
                                        <h4 class="text-xs font-bold">uPVC Pipe ${wo.pipe_diameter_mm}mm</h4>
                                        <div class="text-[10px] text-muted flex justify-between font-mono">
                                            <span>Progress:</span>
                                            <span>${Math.round((wo.produced_meters / wo.quantity_meters)*100)}%</span>
                                        </div>
                                        <div class="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                            <div class="bg-primary h-full" style="width: ${(wo.produced_meters/wo.quantity_meters)*100}%"></div>
                                        </div>
                                        <button onclick="updateWOStatus('${wo.id}', 'completed')" class="w-full bg-green-500 text-zinc-950 text-[10px] py-1 rounded font-bold">Complete Batch</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- COMPLETED -->
                        <div class="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[300px]">
                            <h3 class="text-xs font-bold uppercase tracking-wider text-muted border-b border-border pb-2 mb-3">Completed</h3>
                            <div class="space-y-3 flex-1">
                                ${state.workOrders.filter(w => w.status === 'completed').slice(0, 3).map(wo => `
                                    <div class="bg-background/50 border border-border p-3 rounded-lg space-y-1">
                                        <span class="text-[9px] font-mono text-muted">${wo.order_number}</span>
                                        <h4 class="text-xs font-semibold text-muted">uPVC Pipe ${wo.pipe_diameter_mm}mm</h4>
                                        <div class="text-[9px] text-green-500 font-bold">Passed Quality Check</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // TAB 3: MACHINE TELEMETRY & SENSORS
            const renderMachinesView = () => {
                const activeM = state.machines.find(m => m.id === state.selectedMachineId) || state.machines[0];
                if (!activeM) return `<div class="p-8 text-center text-xs text-muted">Loading telemetry signals...</div>`;
                
                return `
                    <div class="space-y-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <h2 class="text-xl font-bold tracking-tight">Machine Telemetry Diagnostics</h2>
                                <p class="text-xs text-muted">OEE levels and sensor signals for extruder fleet.</p>
                            </div>
                            <select onchange="setSelectedMachine(this.value)" class="bg-card border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none">
                                ${state.machines.map(m => `<option value="${m.id}" ${m.id === state.selectedMachineId ? 'selected' : ''}>${m.machine_code} - ${m.name}</option>`).join('')}
                            </select>
                        </div>

                        <!-- OEE widgets -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div class="bg-card border border-border p-4 rounded-xl text-center">
                                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Availability</p>
                                <h3 class="text-2xl font-bold font-mono mt-2 text-green-500">${activeM.machine_code === 'EXT-06' ? '0.0' : '92.5'}%</h3>
                            </div>
                            <div class="bg-card border border-border p-4 rounded-xl text-center">
                                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Performance</p>
                                <h3 class="text-2xl font-bold font-mono mt-2 text-primary">${activeM.machine_code === 'EXT-06' ? '0.0' : '88.0'}%</h3>
                            </div>
                            <div class="bg-card border border-border p-4 rounded-xl text-center">
                                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Quality Rate</p>
                                <h3 class="text-2xl font-bold font-mono mt-2 text-orange-500">${activeM.machine_code === 'EXT-06' ? '0.0' : '98.2'}%</h3>
                            </div>
                            <div class="bg-card border border-border p-4 rounded-xl text-center">
                                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Total OEE</p>
                                <h3 class="text-2xl font-bold font-mono mt-2 text-sky-400">${activeM.machine_code === 'EXT-06' ? '0.0' : '79.9'}%</h3>
                            </div>
                        </div>

                        <!-- Live Telemetry Graph -->
                        <div class="bg-card border border-border p-6 rounded-xl">
                            <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">Vibration & Die Pressure Signals</h3>
                            <div class="h-64 relative"><canvas id="sensorChart"></canvas></div>
                        </div>
                    </div>
                `;
            };

            // TAB 4: AI AGENT CHAT
            const renderAgentsChat = () => `
                <div class="space-y-6 flex-1 flex flex-col h-[calc(100vh-140px)]">
                    <div>
                        <h2 class="text-xl font-bold tracking-tight">AI Agent Coordinator Orchestrator</h2>
                        <p class="text-xs text-muted">Perform telemetry diagnostic queries directly via streaming responses.</p>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                        <!-- Network diagram mapping -->
                        <div class="bg-card border border-border p-6 rounded-xl flex flex-col items-center justify-center relative hidden lg:flex">
                            <span class="text-[9px] font-bold uppercase tracking-widest text-muted absolute top-4 left-4">Agent Communications Map</span>
                            <div class="h-40 w-40 border border-dashed border-primary/20 rounded-full flex items-center justify-center relative">
                                <div class="bg-primary/20 text-primary border border-primary p-4 rounded-full font-bold text-xs z-10">COORDINATOR</div>
                                <div class="absolute -top-3 left-10 bg-card border border-border px-2 py-0.5 rounded text-[8px] text-muted">PRODUCTION</div>
                                <div class="absolute -bottom-3 right-10 bg-card border border-border px-2 py-0.5 rounded text-[8px] text-muted">INVENTORY</div>
                                <div class="absolute top-1/2 -right-8 bg-card border border-border px-2 py-0.5 rounded text-[8px] text-muted">QUALITY</div>
                                <div class="absolute top-1/2 -left-8 bg-card border border-border px-2 py-0.5 rounded text-[8px] text-muted">TELEMETRY</div>
                            </div>
                        </div>

                        <!-- Chat logs -->
                        <div class="bg-card border border-border rounded-xl flex flex-col lg:col-span-2 overflow-hidden h-full">
                            <div class="p-3 border-b border-border bg-zinc-900 flex items-center gap-2">
                                <span class="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                                <span class="text-[10px] font-mono tracking-widest text-muted font-bold">COORDINATOR AGENT STATUS: ONLINE</span>
                            </div>
                            
                            <div id="chatLog" class="flex-1 p-4 overflow-y-auto space-y-4 bg-zinc-950/20">
                                ${state.chatHistory.map(msg => `
                                    <div class="flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}">
                                        <div class="max-w-[85%] rounded-xl px-4 py-2.5 text-xs ${msg.sender === 'user' ? 'bg-primary text-zinc-950 font-semibold rounded-tr-none' : 'bg-zinc-900 border border-border text-foreground rounded-tl-none whitespace-pre-line'}">
                                            ${msg.sender === 'agent' ? '<div class="text-[8px] text-muted uppercase font-bold font-mono tracking-wider mb-1">Coordinator Agent</div>' : ''}
                                            ${msg.text}
                                        </div>
                                    </div>
                                `).join('')}
                                ${state.isStreaming ? `
                                    <div class="flex justify-start">
                                        <div class="bg-zinc-900 border border-border rounded-xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2">
                                            <span class="text-[9px] text-muted uppercase font-mono">Streaming chunks</span>
                                            <div class="flex gap-1 items-center typing-dots">
                                                <span class="h-1.5 w-1.5 bg-muted rounded-full inline-block animate-bounce"></span>
                                                <span class="h-1.5 w-1.5 bg-muted rounded-full inline-block animate-bounce" style="animation-delay: 0.2s"></span>
                                                <span class="h-1.5 w-1.5 bg-muted rounded-full inline-block animate-bounce" style="animation-delay: 0.4s"></span>
                                            </div>
                                        </div>
                                    </div>
                                ` : ''}
                            </div>

                            <form onsubmit="handleSendChat(event)" class="p-3 border-t border-border bg-card flex gap-2">
                                <input id="chatInput" type="text" placeholder="Type query (e.g. 'OEE anomalies' or 'low stock raw material')..." class="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-xs focus:outline-none focus:border-primary text-white" />
                                <button type="submit" class="bg-primary hover:bg-sky-400 text-zinc-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center">
                                    <i data-lucide="send" class="h-4 w-4"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            `;

            // TAB 5: REPORTS GENERATOR
            const renderReportsBuilder = () => `
                <div class="space-y-6">
                    <div>
                        <h2 class="text-xl font-bold tracking-tight">System Report Builder</h2>
                        <p class="text-xs text-muted">Generate instant summaries from live pipeline records.</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="bg-card border border-border p-6 rounded-xl space-y-4">
                            <h3 class="text-sm font-bold uppercase tracking-wider text-muted">Export Files</h3>
                            
                            <div class="space-y-3">
                                <div class="border border-border p-4 rounded-xl bg-background/50 flex flex-col gap-1">
                                    <span class="text-xs font-bold">Daily Production Summary</span>
                                    <span class="text-[10px] text-muted">Extrusion totals, quality checks, machine parameters cost P&L.</span>
                                    <div class="flex gap-2 mt-4">
                                        <button onclick="downloadReport('daily_production', 'csv')" class="bg-primary text-zinc-950 font-bold px-3 py-1.5 rounded text-[10px] flex items-center gap-1">
                                            <i data-lucide="download" class="h-3.5 w-3.5"></i> Download CSV
                                        </button>
                                    </div>
                                </div>

                                <div class="border border-border p-4 rounded-xl bg-background/50 flex flex-col gap-1">
                                    <span class="text-xs font-bold">Weekly Operations Digest</span>
                                    <span class="text-[10px] text-muted">Overall fleet OEE score index and critical level raw material reorders.</span>
                                    <div class="flex gap-2 mt-4">
                                        <button onclick="downloadReport('weekly_summary', 'csv')" class="bg-primary text-zinc-950 font-bold px-3 py-1.5 rounded text-[10px] flex items-center gap-1">
                                            <i data-lucide="download" class="h-3.5 w-3.5"></i> Download CSV
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-card border border-border p-6 rounded-xl flex flex-col justify-between">
                            <div>
                                <h3 class="text-sm font-bold uppercase tracking-wider text-muted mb-4">Branding Metadata Summary</h3>
                                <p class="text-xs text-muted leading-relaxed">
                                    All files generated contain standardized headers containing the developer verification tags:
                                </p>
                                <div class="bg-background border border-border p-4 rounded-xl mt-4 font-mono text-[9px] text-muted leading-5">
                                    PVCPilot AI — Manufacturing Intelligence Platform<br>
                                    Generated by PVCPilot AI
                                </div>
                            </div>
                            <div class="text-xs text-muted font-bold text-center mt-6">PVCPilot AI © 2026</div>
                        </div>
                    </div>
                </div>
            `;

            // NEW WORK ORDER MODAL
            const renderWOModal = () => !state.showNewWOModal ? '' : `
                <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div class="bg-card border border-border w-full max-w-sm p-6 rounded-xl space-y-4">
                        <div class="flex justify-between items-center border-b border-border pb-2">
                            <h3 class="text-sm font-bold uppercase tracking-wider">Schedule Extruder Run</h3>
                            <button onclick="toggleWOModal(false)" class="text-muted hover:text-foreground"><i data-lucide="x" class="h-5 w-5"></i></button>
                        </div>
                        <form onsubmit="handleWOSubmit(event)" class="space-y-4 text-xs">
                            <div>
                                <label class="font-semibold text-muted block mb-1">Pipe Diameter (mm)</label>
                                <select id="woDia" class="w-full bg-background border border-border px-3 py-2 rounded-lg text-white">
                                    <option value="63">63 mm PN10</option>
                                    <option value="90">90 mm PN10</option>
                                    <option value="110">110 mm PN10</option>
                                </select>
                            </div>
                            <div>
                                <label class="font-semibold text-muted block mb-1">Quantity Target (Meters)</label>
                                <input id="woQty" type="number" value="3000" class="w-full bg-background border border-border px-3 py-2 rounded-lg text-white" />
                            </div>
                            <div>
                                <label class="font-semibold text-muted block mb-1">Assign Extruder</label>
                                <select id="woMachine" class="w-full bg-background border border-border px-3 py-2 rounded-lg text-white">
                                    ${state.machines.map(m => `<option value="${m.id}">${m.machine_code}</option>`).join('')}
                                </select>
                            </div>
                            <button type="submit" class="w-full bg-primary hover:bg-sky-400 text-zinc-950 font-bold py-2 rounded-lg mt-4">Confirm and Reserve Stock</button>
                        </form>
                    </div>
                </div>
            `;

            // --- CHART INITIALIZATIONS ---
            let prodChartInstance = null;
            let costChartInstance = null;
            let sensorChartInstance = null;

            const initCharts = () => {
                if (state.activeTab === 'dashboard') {
                    // Production chart
                    const prodCtx = document.getElementById('prodChart');
                    if (prodCtx) {
                        if (prodChartInstance) prodChartInstance.destroy();
                        prodChartInstance = new Chart(prodCtx, {
                            type: 'line',
                            data: {
                                labels: ['16 Jan', '17 Jan', '18 Jan', '19 Jan', '20 Jan', '21 Jan'],
                                datasets: [
                                    {label: 'Actual Production', data: [3800, 4200, 3900, 4100, 4500, 4300], borderColor: '#0ea5e9', tension: 0.3, fill: true, backgroundColor: 'rgba(14,165,233,0.1)'},
                                    {label: 'Planned Schedule', data: [4000, 4000, 4000, 4200, 4200, 4200], borderColor: '#71717a', borderDash: [5,5], tension: 0.1, fill: false}
                                ]
                            },
                            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
                        });
                    }
                    // Cost Chart
                    const costCtx = document.getElementById('costChart');
                    if (costCtx) {
                        if (costChartInstance) costChartInstance.destroy();
                        costChartInstance = new Chart(costCtx, {
                            type: 'pie',
                            data: {
                                labels: ['RESINS', 'ENERGY', 'LABOR', 'OVERHEAD', 'MAINTENANCE'],
                                datasets: [{
                                    data: [55, 15, 10, 12, 8],
                                    backgroundColor: ['#0ea5e9', '#f97316', '#22c55e', '#a855f7', '#f59e0b']
                                }]
                            },
                            options: { responsive: true, maintainAspectRatio: false }
                        });
                    }
                } else if (state.activeTab === 'machines') {
                    const sensorCtx = document.getElementById('sensorChart');
                    if (sensorCtx) {
                        if (sensorChartInstance) sensorChartInstance.destroy();
                        sensorChartInstance = new Chart(sensorCtx, {
                            type: 'line',
                            data: {
                                labels: Array.from({length: 10}, (_, i) => `${i*10}m ago`).reverse(),
                                datasets: [
                                    {label: 'Temperature ( C)', data: Array.from({length: 10}, () => 180 + Math.random()*8), borderColor: '#ef4444', tension: 0.2, fill: false},
                                    {label: 'Vibration (mm/s)', data: Array.from({length: 10}, () => 2 + Math.random()*0.8), borderColor: '#f59e0b', tension: 0.2, fill: false}
                                ]
                            },
                            options: { responsive: true, maintainAspectRatio: false }
                        });
                    }
                }
            };

            // --- CONTROLLER EVENTS & ROUTING FUNCTIONS ---
            const setTab = (tab) => {
                state.activeTab = tab;
                render();
            };
            const toggleSidebarState = () => {
                state.sidebarOpen = !state.sidebarOpen;
                render();
            };
            const toggleTheme = () => {
                state.theme = state.theme === 'dark' ? 'light' : 'dark';
                const htmlEl = document.documentElement;
                if (state.theme === 'dark') {
                    htmlEl.classList.add("dark");
                } else {
                    htmlEl.classList.remove("dark");
                }
                render();
            };
            const toggleWOModal = (show) => {
                state.showNewWOModal = show;
                render();
            };
            const setSelectedMachine = (id) => {
                state.selectedMachineId = id;
                render();
            };

            // Forms controllers
            const handleLoginSubmit = async () => {
                const email = document.getElementById("email").value;
                const password = document.getElementById("password").value;
                const res = await defCall("/api/auth/login", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                if (res && res.access_token) {
                    state.isAuthenticated = true;
                    // Load data
                    await refreshData();
                    render();
                } else {
                    alert("Unauthorized access. Check default credentials.");
                }
            };

            const handleLogout = () => {
                state.isAuthenticated = false;
                render();
            };

            const handleWOSubmit = async (e) => {
                e.preventDefault();
                const dia = document.getElementById("woDia").value;
                const qty = document.getElementById("woQty").value;
                const machineId = document.getElementById("woMachine").value;
                
                const res = await defCall("/api/production/work-orders", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pipe_diameter_mm: parseInt(dia),
                        pressure_class: "PN10",
                        quantity_meters: parseFloat(qty),
                        machine_id: machineId,
                        shift: "morning",
                        priority: "medium"
                    })
                });

                if (res) {
                    state.showNewWOModal = false;
                    await refreshData();
                    render();
                }
            };

            const updateWOStatus = async (woId, newStatus) => {
                await defCall(`/api/production/work-orders/${woId}/status?status_str=${newStatus}`, { method: 'PATCH' });
                await refreshData();
                render();
            };

            // Stream response
            const handleSendChat = async (e) => {
                e.preventDefault();
                const input = document.getElementById("chatInput");
                const text = input.value.trim();
                if (!text) return;
                
                input.value = "";
                state.chatHistory.push({ sender: 'user', text });
                state.isStreaming = true;
                
                // Add a placeholder message for Coordinator
                const agentMsgIdx = state.chatHistory.length;
                state.chatHistory.push({ sender: 'agent', text: "" });
                render();
                
                // Fetch SSE
                try {
                    const response = await fetch("/api/agents/chat", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: text })
                    });
                    
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const chunkStr = decoder.decode(value);
                        const lines = chunkStr.split("\\n\\n");
                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const dataStr = line.slice(6);
                                if (dataStr.trim() === "[DONE]") break;
                                try {
                                    const parsed = JSON.parse(dataStr);
                                    state.chatHistory[agentMsgIdx].text += parsed.text;
                                    // Update scrolling
                                    const logDiv = document.getElementById("chatLog");
                                    if (logDiv) logDiv.scrollTop = logDiv.scrollHeight;
                                } catch (err) {}
                            }
                        }
                        render();
                    }
                } catch(e) {
                    state.chatHistory[agentMsgIdx].text = "Error connecting to server.";
                } finally {
                    state.isStreaming = false;
                    render();
                }
            };

            // Download Report helper
            const downloadReport = async (type, format) => {
                const res = await fetch("/api/reports/generate", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ report_type: type, format })
                });
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `PVCPilot_${type}_Report.${format}`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            };

            // Sync database listings helper
            const refreshData = async () => {
                 const res = await defCall("/api/dashboard/overview");
                 if (res) {
                     state.kpis = res.kpis;
                     state.machines = res.machine_statuses;
                     state.alerts = res.top_alerts;
                 }
                const wo = await defCall("/api/production/work-orders");
                if (wo) state.workOrders = wo;
            };

            // Loop to fetch simulated updates on active tab
            setInterval(async () => {
                if (state.isAuthenticated) {
                    await refreshData();
                    if (state.activeTab === 'machines') {
                        // Refresh sensors
                        const activeM = state.machines.find(m => m.id === state.selectedMachineId) || state.machines[0];
                        if (activeM) {
                            const readings = await defCall(`/api/machines/${activeM.id}/sensors`);
                            // update chart data
                            if (sensorChartInstance && readings && readings.length > 0) {
                                sensorChartInstance.data.datasets[0].data = readings.map(r => r.temperature_celsius);
                                sensorChartInstance.data.datasets[1].data = readings.map(r => r.vibration_mm_s);
                                sensorChartInstance.update();
                            }
                        }
                    }
                    render();
                }
            }, 6000);

            // Start up rendering
            render();
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=3000)
