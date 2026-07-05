"use client";

import React, { useState, useEffect } from "react";
import { 
  Factory, ClipboardList, Settings2, Package, TrendingUp, ShieldCheck, 
  BellRing, Zap, ChevronLeft, ChevronRight, Menu, LogOut, Moon, Sun, 
  User as UserIcon, Send, Brain, LineChart as ChartIcon, FileText, CheckCircle, 
  X, AlertTriangle, Play, CheckSquare, Plus, Download, RefreshCw, Layers
} from "lucide-react";
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { useAuthStore } from "../store/authStore";
import { useUIStore } from "../store/uiStore";
import { useAgentStore, ChatMessage } from "../store/agentStore";
import { useAlertStore, AlertItem } from "../store/alertStore";
import { useWebSocket } from "../hooks/useWebSocket";
import { api } from "../lib/api";

import { ProductionOverview } from "../components/dashboard/ProductionOverview";
import { WorkOrderCard } from "../components/production/WorkOrderCard";
import { OEEGaugePanel } from "../components/machines/OEEGaugePanel";
import { MachineDiagnosticsPanel } from "../components/machines/MachineDiagnosticsPanel";
import { AppFooter } from "../components/layout/AppFooter";
import { MACHINE_TELEMETRY_CONFIGS } from "../lib/machineTelemetryConfig";

const BRAND_COLORS = ["#0EA5E9", "#F97316", "#22C55E", "#A855F7", "#F59E0B", "#EF4444"];

export default function Home() {
  const { user, token, isAuthenticated, login, logout } = useAuthStore();
  const { sidebarOpen, theme, toggleSidebar, setTheme } = useUIStore();
  const { chatHistory, isStreaming, addMessage, updateLastMessageText, setStreaming } = useAgentStore();
  const { alerts, unreadCount, setAlerts, acknowledgeAlert, markAllRead } = useAlertStore();

  // Connect WebSockets
  const wsConnected = useWebSocket("machine_status,alerts");

  // Local state
  const [activeTab, setActiveTab] = useState("dashboard");
  const [loginEmail, setLoginEmail] = useState("owner@pvcpilot.com");
  const [loginPassword, setLoginPassword] = useState("PVCPilot@2025");
  const [loginLoading, setLoginLoading] = useState(false);
  const [kpis, setKpis] = useState<any>({
    todays_production_tons: 12.4,
    active_work_orders: 8,
    machine_uptime_pct: 87.3,
    raw_material_stock_days: 14,
    revenue_mtd_lakhs: 48.2,
    quality_pass_rate_pct: 96.1,
    open_alerts: 3,
    energy_today_kwh: 1840
  });
  
  const [prodChartData, setProdChartData] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<any>({});
  
  // Modals / Inputs
  const [chatInput, setChatInput] = useState("");
  const [showNewWOModal, setShowNewWOModal] = useState(false);
  const [newWODiameter, setNewWODiameter] = useState("90");
  const [newWOQuantity, setNewWOQuantity] = useState("3000");
  const [newWOMachine, setNewWOMachine] = useState("");
  const [newWOShift, setNewWOShift] = useState("morning");
  const [newWOPriority, setNewWOPriority] = useState("medium");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedMachineSensors, setSelectedMachineSensors] = useState<any[]>([]);
  const [selectedMachineOee, setSelectedMachineOee] = useState<any>({
    availability: 92.5,
    performance: 88.0,
    quality: 98.2,
    oee: 79.9
  });
  const [showNotifications, setShowNotifications] = useState(false);

  // Fetch Dashboard & Inventory data on auth
  const fetchDashboardData = async () => {
    if (!isAuthenticated) return;
    try {
      // Fetch overview aggregates
      const res = await api.get("/dashboard/overview");
      setKpis(res.data.kpis);
      setProdChartData(res.data.production_chart);
      setMachines(res.data.machine_statuses);
      if (res.data.machine_statuses.length > 0 && !selectedMachineId) {
        setSelectedMachineId(res.data.machine_statuses[0].id);
      }
      
      // Fetch alerts
      const alertsRes = await api.get("/alerts");
      setAlerts(alertsRes.data);

      // Fetch materials
      const matRes = await api.get("/inventory/raw-materials");
      setRawMaterials(matRes.data);

      // Fetch finished goods
      const fgRes = await api.get("/inventory/finished-goods");
      setFinishedGoods(fgRes.data);

      // Fetch work orders
      const woRes = await api.get("/production/work-orders");
      setWorkOrders(woRes.data);

      // Fetch costs breakdown
      const costRes = await api.get("/finance/cost-breakdown");
      setCostBreakdown(costRes.data);

    } catch (e) {
      console.error("Error loading dashboard data:", e);
      toast.error("Failed to load live data. Using fallback metrics.");
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
      // Poll data every 10 seconds to show dynamic simulation updates
      const interval = setInterval(() => fetchDashboardData(), 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, selectedMachineId]);

  // Fetch selected machine sensor trends & OEE
  const fetchMachineDetails = async () => {
    if (!selectedMachineId) return;
    try {
      const sensorRes = await api.get(`/machines/${selectedMachineId}/sensors?hours=4`);
      setSelectedMachineSensors(sensorRes.data);
      const oeeRes = await api.get(`/machines/${selectedMachineId}/oee`);
      setSelectedMachineOee(oeeRes.data);
    } catch (e) {
      console.error("Error loading machine details:", e);
    }
  };

  useEffect(() => {
    if (selectedMachineId) {
      fetchMachineDetails();
    }
  }, [selectedMachineId]);

  // Handle user login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await api.post("/auth/login", {
        email: loginEmail,
        password: loginPassword
      });
      login({
        email: res.data.email,
        role: res.data.role,
        full_name: res.data.full_name
      }, res.data.access_token);
      toast.success(`Logged in as ${res.data.full_name}`);
    } catch (err: any) {
      console.error("Login failed:", err);
      toast.error(err.response?.data?.detail || "Authentication failed. Make sure seed_data is run.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Submit Work Order
  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetMachine = newWOMachine || (machines.length > 0 ? machines[0].id : "");
      if (!targetMachine) {
        toast.error("No valid extruder machine selected.");
        return;
      }
      
      const payload = {
        pipe_diameter_mm: parseInt(newWODiameter),
        pressure_class: "PN10",
        quantity_meters: parseFloat(newWOQuantity),
        machine_id: targetMachine,
        shift: newWOShift,
        planned_start: new Date().toISOString(),
        planned_end: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
        priority: newWOPriority,
        notes: "Scheduled via planner board."
      };
      
      await api.post("/production/work-orders", payload);
      toast.success("Work Order successfully created! Materials reserved.");
      setShowNewWOModal(false);
      fetchDashboardData();
    } catch (err: any) {
      console.error("Error creating work order:", err);
      toast.error(err.response?.data?.detail || "Failed to create work order.");
    }
  };

  // Update Work Order Status
  const handleUpdateStatus = async (woId: string, status: string) => {
    try {
      await api.patch(`/production/work-orders/${woId}/status?status_str=${status}`);
      toast.success(`Work Order updated to ${status}`);
      fetchDashboardData();
    } catch (e) {
      toast.error("Failed to update status.");
    }
  };

  // Submit Agent Chat query
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsgText = chatInput;
    setChatInput("");

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: userMsgText,
      timestamp: new Date().toLocaleTimeString()
    };
    addMessage(userMsg);
    setStreaming(true);

    const agentMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "agent",
      text: "",
      timestamp: new Date().toLocaleTimeString(),
      agentName: "Coordinator Agent"
    };
    addMessage(agentMsg);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"}/agents/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ message: userMsgText })
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split("\n\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);
            if (dataStr.trim() === "[DONE]") {
              break;
            }
            try {
              const dataObj = JSON.parse(dataStr);
              updateLastMessageText(dataObj.text);
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.error("SSE error:", e);
      updateLastMessageText("\n\nFailed to stream response from Coordinator. Falling back to local responder.");
    } finally {
      setStreaming(false);
    }
  };

  // Generate Report triggers
  const handleDownloadReport = async (type: string, format: string) => {
    try {
      toast.info(`Generating ${type.replace("_", " ")} ${format.toUpperCase()}...`);
      const res = await api.post("/reports/generate", {
        report_type: type,
        format: format,
        start_date: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
        end_date: new Date().toISOString()
      }, { responseType: "blob" });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `PVCPilot_${type}_Report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Download complete.");
    } catch (e) {
      toast.error("Failed to generate report.");
    }
  };

  // Acknowledge alert
  const handleAcknowledgeAlert = async (id: string) => {
    try {
      await api.patch(`/alerts/${id}/acknowledge`);
      acknowledgeAlert(id);
      toast.success("Alert acknowledged.");
      fetchDashboardData();
    } catch (e) {
      toast.error("Failed to acknowledge alert.");
    }
  };

  // Render Auth Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center relative overflow-hidden px-4">
        {/* Decorative industrial pipes background */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] border-r-[40px] border-b-[40px] border-sky-500/10 rounded-br-[200px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] border-l-[30px] border-t-[30px] border-orange-500/10 rounded-tl-[180px]" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-8 rounded-2xl shadow-2xl relative z-10"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 w-16 bg-sky-500/20 text-sky-400 flex items-center justify-center rounded-2xl mb-4 border border-sky-500/30 shadow-lg shadow-sky-500/10">
              <Factory className="h-9 w-9" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">PVCPilot AI</h1>
            <p className="text-sm text-zinc-400 mt-1">Multi-Agent Manufacturing Intelligence</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Email Address</label>
              <input 
                type="email" 
                required 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-1">Password</label>
              <input 
                type="password" 
                required 
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-sky-500 transition-colors"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            <button 
              type="submit" 
              disabled={loginLoading}
              className="w-full bg-sky-500 hover:bg-sky-600 active:bg-sky-700 text-zinc-950 font-semibold rounded-lg py-3 mt-6 transition-all hover:shadow-lg hover:shadow-sky-500/20 flex items-center justify-center"
            >
              {loginLoading ? "Verifying Credentials..." : "Authenticate Platform"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-500">
            PVCPilot AI © {new Date().getFullYear()}
          </div>
        </motion.div>
      </div>
    );
  }

  // Cost breakdown pie chart mapper
  const costPieData = Object.keys(costBreakdown).map((k) => ({
    name: k.replace("_", " ").toUpperCase(),
    value: costBreakdown[k]
  }));

  // Finished Goods charts
  const fgPieData = finishedGoods.map((fg) => ({
    name: fg.product_name,
    value: fg.available_quantity_meters
  }));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      
      {/* 1. Header */}
      <header className="h-16 border-b border-border bg-card/85 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleSidebar} 
            className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" />
            <span className="font-bold tracking-tight text-lg">PVCPilot AI</span>
          </div>
          <span className="h-4 w-px bg-border hidden sm:block" />
          <span className="text-xs font-mono bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 hidden sm:block">
            {wsConnected ? "● WebSocket Sync" : "○ Local Polling"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Theme toggler */}
          <button 
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Alarm Notifications Bell */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors relative"
            >
              <BellRing className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 h-4 w-4 bg-red-500 text-[10px] text-white flex items-center justify-center font-bold rounded-full border-2 border-background animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>
            <AnimatePresence>
              {showNotifications && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
                >
                  <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Alarms ({unreadCount})</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[10px] text-primary hover:underline font-semibold">Mark read</button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-border">
                    {alerts.filter(a => !a.is_acknowledged).length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">No active warnings.</div>
                    ) : (
                      alerts.filter(a => !a.is_acknowledged).map((alt) => (
                        <div key={alt.id} className="p-3 hover:bg-muted/30 transition-colors flex gap-2">
                          <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${alt.severity === "critical" ? "text-red-500" : "text-amber-500"}`} />
                          <div className="flex-1">
                            <h4 className="text-xs font-semibold">{alt.title}</h4>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{alt.message}</p>
                            <button 
                              onClick={() => handleAcknowledgeAlert(alt.id)}
                              className="text-[10px] text-primary hover:underline mt-2 font-medium"
                            >
                              Acknowledge
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-8 w-px bg-border" />

          {/* User info & logout */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold">{user?.full_name}</p>
              <p className="text-[10px] text-muted-foreground uppercase font-mono">{user?.role?.replace("_", " ")}</p>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex flex-1 relative">
        
        {/* 2. Collapsible Sidebar */}
        <aside 
          className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col shrink-0 sticky top-16 h-[calc(100vh-64px)] z-30 ${sidebarOpen ? "w-64" : "w-16"}`}
        >
          <div className="flex-1 py-6 overflow-y-auto px-3 space-y-4">
            
            {/* Main Section */}
            <div>
              {sidebarOpen && <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-3 mb-2">Main Controls</p>}
              <nav className="space-y-1">
                <button 
                  onClick={() => setActiveTab("dashboard")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "dashboard" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <Factory className="h-5 w-5" />
                  {sidebarOpen && <span>Dashboard</span>}
                </button>
                <button 
                  onClick={() => setActiveTab("production")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "production" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <ClipboardList className="h-5 w-5" />
                  {sidebarOpen && <span>Production Board</span>}
                </button>
                <button 
                  onClick={() => setActiveTab("machines")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "machines" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <Settings2 className="h-5 w-5" />
                  {sidebarOpen && <span>Machines OEE</span>}
                </button>
              </nav>
            </div>

            {/* Inventory & Logistics */}
            <div>
              {sidebarOpen && <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-3 mb-2">Logistics</p>}
              <nav className="space-y-1">
                <button 
                  onClick={() => setActiveTab("inventory")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "inventory" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <Package className="h-5 w-5" />
                  {sidebarOpen && <span>Inventory Stock</span>}
                </button>
              </nav>
            </div>

            {/* Intelligence Section */}
            <div>
              {sidebarOpen && <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-3 mb-2">AI Diagnostics</p>}
              <nav className="space-y-1">
                <button 
                  onClick={() => setActiveTab("agents")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "agents" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <Brain className="h-5 w-5" />
                  {sidebarOpen && <span>Ask AI Agents</span>}
                </button>
                <button 
                  onClick={() => setActiveTab("forecasting")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "forecasting" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <ChartIcon className="h-5 w-5" />
                  {sidebarOpen && <span>AI Forecasting</span>}
                </button>
                <button 
                  onClick={() => setActiveTab("reports")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "reports" ? "bg-primary/10 text-primary border-l-2 border-primary font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                >
                  <FileText className="h-5 w-5" />
                  {sidebarOpen && <span>Reports Builder</span>}
                </button>
              </nav>
            </div>

          </div>

          {/* Sidebar Footer branding */}
          <div className="py-4 border-t border-sidebar-border text-center">
            {sidebarOpen ? (
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-center mx-3">
                <p className="text-[10px] text-muted-foreground font-medium">PVCPilot AI</p>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">Manufacturing Intelligence Platform</p>
              </div>
            ) : (
              <p className="text-[10px] text-primary font-bold font-mono">PVC</p>
            )}
          </div>
        </aside>

        {/* 3. Main Content Container */}
        <main className="flex-1 p-6 overflow-y-auto bg-background min-h-[calc(100vh-64px)] flex flex-col">
          
          <AnimatePresence mode="wait">
            
            {/* VIEW: MAIN DASHBOARD */}
            {activeTab === "dashboard" && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-6 flex-1"
              >
                {/* Dashboard Welcome Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Factory Control Dashboard</h2>
                    <p className="text-xs text-muted-foreground">Welcome back, {user?.full_name}. Here is your live manufacturing summary.</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span className="font-semibold block">{new Date().toDateString()}</span>
                    <span>System Status: <b className="text-green-500 font-bold">● OPERATIONAL</b></span>
                  </div>
                </div>

                {/* KPI Cards Strip (8 Cards) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-sky-500/20"><Factory className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today's Production</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.todays_production_tons} Tons</h3>
                    <p className="text-[10px] text-green-500 font-semibold mt-1">▲ 2.1% vs yesterday</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-indigo-500/20"><ClipboardList className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Work Orders</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.active_work_orders} Orders</h3>
                    <p className="text-[10px] text-indigo-500 font-semibold mt-1">Status: Running smoothly</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-green-500/20"><Settings2 className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Machine Uptime</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.machine_uptime_pct}%</h3>
                    <p className="text-[10px] text-green-500 font-semibold mt-1">▲ 0.4% OEE trend</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-amber-500/20"><Package className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Raw Material Stock</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.raw_material_stock_days} Days</h3>
                    <p className="text-[10px] text-amber-500 font-semibold mt-1">Lead: reorders pending</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-emerald-500/20"><TrendingUp className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Revenue MTD</p>
                    <h3 className="text-xl font-bold font-mono mt-2">₹{kpis.revenue_mtd_lakhs} Lakhs</h3>
                    <p className="text-[10px] text-green-500 font-semibold mt-1">▲ 5.3% MoM growth</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-teal-500/20"><ShieldCheck className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quality Pass Rate</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.quality_pass_rate_pct}%</h3>
                    <p className="text-[10px] text-green-500 font-semibold mt-1">▲ 0.8% pass rate target</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-red-500/20"><BellRing className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Open Alerts</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.open_alerts} Alarms</h3>
                    <p className="text-[10px] text-red-500 font-semibold mt-1">1 Critical fault active</p>
                  </div>

                  <div className="bg-card border border-border p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                    <div className="absolute top-3 right-3 text-purple-500/20"><Zap className="h-10 w-10" /></div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Energy Today</p>
                    <h3 className="text-xl font-bold font-mono mt-2">{kpis.energy_today_kwh} kWh</h3>
                    <p className="text-[10px] text-green-500 font-semibold mt-1">▼ 4.2% off-peak load</p>
                  </div>
                </div>

                {/* Recharts plots & machine grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Production Overview Charts Container */}
                  <ProductionOverview />

                  {/* Right Column - Machine Status Grid */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Live Machine Grid</h3>
                    <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                      {machines.length === 0 ? (
                        <div className="col-span-2 text-center text-xs text-muted-foreground p-8">No machines found.</div>
                      ) : (
                        machines.map((mach) => (
                          <div 
                            key={mach.id} 
                            onClick={() => {
                              setSelectedMachineId(mach.id);
                              setActiveTab("machines");
                            }}
                            className="bg-background border border-border p-3 rounded-lg hover:border-primary transition-all cursor-pointer relative overflow-hidden hover:shadow-sm"
                          >
                            <span className="text-xs font-semibold">{mach.machine_code}</span>
                            <div className="flex items-center gap-1.5 mt-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${
                                mach.current_status === "running" ? "bg-green-500 animate-pulse" :
                                mach.current_status === "maintenance" ? "bg-amber-500" :
                                mach.current_status === "fault" ? "bg-red-500" : "bg-neutral-500"
                              }`} />
                              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">{mach.current_status}</span>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground mt-3 flex justify-between">
                              <span>OEE: {mach.oee}%</span>
                              <span>Temp: {round(mach.current_temperature_celsius, 0)}°C</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom row: Costs vs Sales breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Financial breakdown pie chart */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Production Cost Breakdown (INR)</h3>
                    <div className="h-64 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="w-full sm:w-[60%] h-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={costPieData.length > 0 ? costPieData : [{name: "No data", value: 1}]}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {costPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={BRAND_COLORS[index % BRAND_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 space-y-2 text-xs">
                        {costPieData.map((c, i) => (
                          <div key={c.name} className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: BRAND_COLORS[i % BRAND_COLORS.length] }} />
                            <span className="text-muted-foreground truncate">{c.name.toLowerCase()}:</span>
                            <span className="font-semibold ml-auto font-mono">₹{c.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* AI Recommendations Panel */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex flex-col">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Diagnostics AI Recommendations</h3>
                    <div className="space-y-4 flex-1 overflow-y-auto max-h-60 pr-1">
                      <div className="bg-background border-l-4 border-red-500 p-3 rounded-r-lg">
                        <span className="text-[10px] font-bold text-red-500 uppercase font-mono">Machine Agent · Critical</span>
                        <p className="text-xs font-medium mt-1">High vibration alert detected on Extruder EXT-06. Production run on Line 6 halted. Die recalibration is required.</p>
                      </div>
                      <div className="bg-background border-l-4 border-amber-500 p-3 rounded-r-lg">
                        <span className="text-[10px] font-bold text-amber-500 uppercase font-mono">Inventory Agent · Warning</span>
                        <p className="text-xs font-medium mt-1">Lead Stabilizer stock drops to 2,300 kg (safety threshold: 3,000 kg). Trigger reorder protocol from Bodal Chemicals.</p>
                      </div>
                      <div className="bg-background border-l-4 border-sky-500 p-3 rounded-r-lg">
                        <span className="text-[10px] font-bold text-sky-500 uppercase font-mono">Energy Agent · Optimization</span>
                        <p className="text-xs font-medium mt-1">Peak load tariff active. Recommend scheduling high-diameter extruder batch mixes after 22:00 for off-peak cost cuts.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveTab("agents")}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 rounded-lg text-xs mt-4 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Brain className="h-4 w-4" /> Ask Coordinator Agent
                    </button>
                  </div>

                </div>
              </motion.div>
            )}

            {/* VIEW: PRODUCTION KANBAN BOARD */}
            {activeTab === "production" && (
              <motion.div 
                key="production"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 flex-1"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Production Scheduler Board</h2>
                    <p className="text-xs text-muted-foreground">Manage and track work order batches across extruders and cutters.</p>
                  </div>
                  <button 
                    onClick={() => {
                      if (machines.length > 0) {
                        setNewWOMachine(machines[0].id);
                      }
                      setShowNewWOModal(true);
                    }}
                    className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-sm transition-colors"
                  >
                    <Plus className="h-4 w-4" /> New Work Order
                  </button>
                </div>

                {/* Kanban columns */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  
                  {/* DRAFT */}
                  <div className="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 mb-3 flex items-center justify-between">
                      <span>Draft</span>
                      <span className="bg-neutral-800 text-neutral-300 text-[10px] px-2 py-0.5 rounded-full font-mono">
                        {workOrders.filter(w => w.status === "draft").length}
                      </span>
                    </h3>
                    <div className="space-y-3 flex-1 overflow-y-auto">
                      {workOrders.filter(w => w.status === "draft").map(wo => (
                        <WorkOrderCard 
                          key={wo.id}
                          order={wo}
                          onAction={() => handleUpdateStatus(wo.id, "scheduled")}
                          actionText="Schedule Batch"
                          actionIcon={<Play className="h-3 w-3" />}
                        />
                      ))}
                    </div>
                  </div>

                  {/* SCHEDULED */}
                  <div className="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 mb-3 flex items-center justify-between">
                      <span>Scheduled</span>
                      <span className="bg-neutral-800 text-neutral-300 text-[10px] px-2 py-0.5 rounded-full font-mono">
                        {workOrders.filter(w => w.status === "scheduled").length}
                      </span>
                    </h3>
                    <div className="space-y-3 flex-1 overflow-y-auto">
                      {workOrders.filter(w => w.status === "scheduled").map(wo => (
                        <WorkOrderCard 
                          key={wo.id}
                          order={wo}
                          onAction={() => handleUpdateStatus(wo.id, "in_progress")}
                          actionText="Start Extrusion"
                          actionIcon={<Play className="h-3 w-3" />}
                        />
                      ))}
                    </div>
                  </div>

                  {/* IN PROGRESS */}
                  <div className="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 mb-3 flex items-center justify-between">
                      <span>In Progress</span>
                      <span className="bg-neutral-800 text-neutral-300 text-[10px] px-2 py-0.5 rounded-full font-mono">
                        {workOrders.filter(w => w.status === "in_progress").length}
                      </span>
                    </h3>
                    <div className="space-y-3 flex-1 overflow-y-auto">
                      {workOrders.filter(w => w.status === "in_progress").map(wo => (
                        <WorkOrderCard 
                          key={wo.id}
                          order={wo}
                          onAction={() => handleUpdateStatus(wo.id, "completed")}
                          actionText="Complete Run"
                          actionIcon={<CheckSquare className="h-3 w-3" />}
                        />
                      ))}
                    </div>
                  </div>

                  {/* COMPLETED */}
                  <div className="bg-card border border-border p-4 rounded-xl flex flex-col min-h-[400px]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 mb-3 flex items-center justify-between">
                      <span>Completed</span>
                      <span className="bg-neutral-800 text-neutral-300 text-[10px] px-2 py-0.5 rounded-full font-mono">
                        {workOrders.filter(w => w.status === "completed").length}
                      </span>
                    </h3>
                    <div className="space-y-3 flex-1 overflow-y-auto max-h-[360px]">
                      {workOrders.filter(w => w.status === "completed").slice(0, 5).map(wo => (
                        <WorkOrderCard 
                          key={wo.id}
                          order={wo}
                        />
                      ))}
                    </div>
                  </div>

                </div>

                {/* Live Gantt Chart View */}
                <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Gantt Shift Capacity Scheduler</h3>
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px] border border-border rounded-lg divide-y divide-border text-xs">
                      <div className="grid grid-cols-5 bg-muted/30 font-bold p-3">
                        <div className="col-span-1">Machine / Extruder</div>
                        <div className="col-span-1">Morning Shift</div>
                        <div className="col-span-1">Afternoon Shift</div>
                        <div className="col-span-1">Night Shift</div>
                        <div className="col-span-1">Status</div>
                      </div>
                      
                      {machines.slice(0, 5).map((m) => (
                        <div key={m.id} className="grid grid-cols-5 p-3 items-center">
                          <div className="col-span-1 font-semibold">{m.machine_code} ({m.location})</div>
                          <div className="col-span-1">
                            <span className="bg-primary/20 text-primary border border-primary/20 rounded px-2 py-0.5">uPVC 110mm</span>
                          </div>
                          <div className="col-span-1">
                            <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded px-2 py-0.5">uPVC 90mm</span>
                          </div>
                          <div className="col-span-1">
                            <span className="text-muted-foreground italic">Scheduled Idle</span>
                          </div>
                          <div className="col-span-1">
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${m.current_status === "running" ? "bg-green-500/10 text-green-500" : "bg-neutral-800 text-neutral-400"}`}>
                              {m.current_status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </motion.div>
            )}

            {/* VIEW: MACHINE HEALTH OEE DETAILS */}
            {activeTab === "machines" && (() => {
              const currentMach = machines.find(m => m.id === selectedMachineId);
              const currentMachCode = currentMach ? currentMach.machine_code : "EXT-01";
              const currentMachOeeConfig = MACHINE_TELEMETRY_CONFIGS[currentMachCode] || MACHINE_TELEMETRY_CONFIGS["EXT-01"];
              return (
                <motion.div 
                  key="machines"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6 flex-1"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Machine Telemetry & Diagnostic Health</h2>
                      <p className="text-xs text-muted-foreground">Monitor motor speed, temperature zones, pressure, and OEE levels.</p>
                    </div>
                    <div className="flex gap-2">
                      <label className="text-xs font-semibold text-muted-foreground self-center">Select Machine:</label>
                      <select 
                        value={selectedMachineId} 
                        onChange={(e) => setSelectedMachineId(e.target.value)}
                        className="bg-card border border-border text-foreground px-3 py-1.5 rounded-lg text-xs font-medium focus:outline-none"
                      >
                        {machines.map((m) => (
                          <option key={m.id} value={m.id}>{m.machine_code} - {m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Summary gauges */}
                  <OEEGaugePanel 
                    availability={selectedMachineOee.availability}
                    performance={selectedMachineOee.performance}
                    quality={selectedMachineOee.quality}
                    oee={selectedMachineOee.oee}
                    targets={{
                      availability: currentMachOeeConfig.availabilityTarget,
                      performance: currentMachOeeConfig.performanceTarget,
                      quality: currentMachOeeConfig.qualityTarget,
                      oee: currentMachOeeConfig.oeeTarget
                    }}
                  />

                  {/* Sensor Trend Line Plot */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Sensor Trend Analytics (Last 4 Hours)</h3>
                    <MachineDiagnosticsPanel 
                      machineCode={currentMachCode}
                      sensorData={selectedMachineSensors}
                    />
                  </div>
                </motion.div>
              );
            })()}

            {/* VIEW: INVENTORY & WAREHOUSE */}
            {activeTab === "inventory" && (
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 flex-1"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">Stock Logistics Dashboard</h2>
                    <p className="text-xs text-muted-foreground">Review materials reorder limits, and check physical warehouse allocation zones.</p>
                  </div>
                </div>

                {/* Left/Right Column: Tables & Map */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column: Raw Materials list */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm lg:col-span-2 space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Raw Materials Inventory</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/40">
                            <th className="p-3">Material Name</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3 text-right">Available Stock</th>
                            <th className="p-3 text-right">Reorder Limit</th>
                            <th className="p-3 text-right">Unit Price</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {rawMaterials.map((rm) => (
                            <tr key={rm.id} className="hover:bg-muted/10">
                              <td className="p-3 font-semibold">{rm.name}</td>
                              <td className="p-3 font-mono text-muted-foreground">{rm.sku}</td>
                              <td className="p-3 text-right font-mono font-bold">{rm.current_stock.toLocaleString()} {rm.unit}</td>
                              <td className="p-3 text-right font-mono text-muted-foreground">{rm.reorder_level.toLocaleString()}</td>
                              <td className="p-3 text-right font-mono">₹{rm.unit_cost}</td>
                              <td className="p-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  rm.current_stock < rm.reorder_level ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                                }`}>
                                  {rm.current_stock < rm.reorder_level ? "CRITICAL STOCK" : "STOCK OK"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Column: Warehouse Zone Occupancy Map */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Warehouse Occupancy Map</h3>
                    
                    {/* SVG Layout */}
                    <div className="border border-border p-4 bg-muted/20 rounded-xl flex items-center justify-center">
                      <svg width="220" height="220" viewBox="0 0 220 220" className="w-full max-w-[200px]">
                        {/* Zone A */}
                        <rect x="10" y="10" width="90" height="60" rx="6" fill="#0EA5E9" fillOpacity="0.15" stroke="#0EA5E9" strokeWidth="1.5" />
                        <text x="55" y="45" fill="var(--foreground)" fontSize="10" fontWeight="bold" textAnchor="middle">Zone A: Resin</text>
                        {/* Zone B */}
                        <rect x="120" y="10" width="90" height="60" rx="6" fill="#22C55E" fillOpacity="0.15" stroke="#22C55E" strokeWidth="1.5" />
                        <text x="165" y="45" fill="var(--foreground)" fontSize="10" fontWeight="bold" textAnchor="middle">Zone B: Stabilizer</text>
                        {/* Zone C */}
                        <rect x="10" y="80" width="90" height="60" rx="6" fill="#A855F7" fillOpacity="0.15" stroke="#A855F7" strokeWidth="1.5" />
                        <text x="55" y="115" fill="var(--foreground)" fontSize="10" fontWeight="bold" textAnchor="middle">Zone C: Lube</text>
                        {/* Zone D */}
                        <rect x="120" y="80" width="90" height="60" rx="6" fill="#F59E0B" fillOpacity="0.15" stroke="#F59E0B" strokeWidth="1.5" />
                        <text x="165" y="115" fill="var(--foreground)" fontSize="10" fontWeight="bold" textAnchor="middle">Zone D: Filler</text>
                        {/* Zone F */}
                        <rect x="10" y="150" width="200" height="60" rx="6" fill="#EF4444" fillOpacity="0.15" stroke="#EF4444" strokeWidth="1.5" />
                        <text x="110" y="185" fill="var(--foreground)" fontSize="10" fontWeight="bold" textAnchor="middle">Zone F: Finished Goods (92%)</text>
                      </svg>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Zone A Capacity:</span>
                        <span className="font-semibold">74% (Resins)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Zone B Capacity:</span>
                        <span className="font-semibold">38% (Stabilizers)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Zone F (Finished goods):</span>
                        <span className="font-semibold text-red-500">92% (CRITICAL OCCUPANCY)</span>
                      </div>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

            {/* VIEW: ASK AI AGENTS CHAT PANEL */}
            {activeTab === "agents" && (
              <motion.div 
                key="agents"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 flex-1 flex flex-col h-[calc(100vh-112px)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">AI Agent Multi-Agent Orchestrator</h2>
                    <p className="text-xs text-muted-foreground">Ask the coordinator agent to diagnose plant telemetry faults, stock-outs or scheduling conflicts.</p>
                  </div>
                </div>

                {/* SVG Agent network map & Chat Panel */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                  
                  {/* Left Column: Animated network map */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden hidden lg:flex">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground absolute top-4 left-4">Agent Communications Map</span>
                    
                    {/* SVG Map */}
                    <svg width="260" height="260" viewBox="0 0 260 260" className="w-full max-w-[240px]">
                      {/* Coordinator (Center) */}
                      <circle cx="130" cy="130" r="28" fill="#0EA5E9" fillOpacity="0.2" stroke="#0EA5E9" strokeWidth="2" className="animate-pulse" />
                      <text x="130" y="134" fill="var(--foreground)" fontSize="9" fontWeight="bold" textAnchor="middle">COORDINATOR</text>
                      
                      {/* Production Agent */}
                      <line x1="130" y1="130" x2="60" y2="60" stroke="#0EA5E9" strokeWidth="1" strokeDasharray="4 4" />
                      <circle cx="60" cy="60" r="18" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
                      <text x="60" y="63" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle">PROD</text>

                      {/* Quality Agent */}
                      <line x1="130" y1="130" x2="200" y2="60" stroke="#0EA5E9" strokeWidth="1" strokeDasharray="4 4" />
                      <circle cx="200" cy="60" r="18" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
                      <text x="200" y="63" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle">QUAL</text>

                      {/* Machine Health */}
                      <line x1="130" y1="130" x2="60" y2="200" stroke="#0EA5E9" strokeWidth="1" strokeDasharray="4 4" />
                      <circle cx="60" cy="200" r="18" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
                      <text x="60" y="203" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle">MACH</text>

                      {/* Inventory Agent */}
                      <line x1="130" y1="130" x2="200" y2="200" stroke="#0EA5E9" strokeWidth="1" strokeDasharray="4 4" />
                      <circle cx="200" cy="200" r="18" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
                      <text x="200" y="203" fill="var(--muted-foreground)" fontSize="8" textAnchor="middle">INV</text>
                    </svg>

                    <div className="text-center text-[10px] text-muted-foreground mt-4 font-medium px-4">
                      Gemini acts as the Coordinator routing specific diagnostics to specialized sub-agents.
                    </div>
                  </div>

                  {/* Right Column: Chat interface */}
                  <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col lg:col-span-2 overflow-hidden h-full min-h-[400px]">
                    <div className="p-3 border-b border-border bg-muted/30 flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-bold font-mono tracking-wider">COORDINATOR AGENT ACTIVE</span>
                    </div>

                    {/* Message Log */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-muted/10">
                      {chatHistory.map((msg) => (
                        <div 
                          key={msg.id} 
                          className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div 
                            className={`max-w-[85%] rounded-xl px-4 py-3 text-xs shadow-sm ${
                              msg.sender === "user" 
                                ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                                : "bg-card border border-border text-foreground rounded-tl-none whitespace-pre-line"
                            }`}
                          >
                            {msg.sender === "agent" && (
                              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-muted-foreground uppercase font-bold tracking-wider font-mono">
                                <span>{msg.agentName}</span>
                              </div>
                            )}
                            {msg.text}
                          </div>
                        </div>
                      ))}

                      {/* Typing indicator */}
                      {isStreaming && (
                        <div className="flex justify-start">
                          <div className="bg-card border border-border rounded-xl rounded-tl-none px-4 py-3 flex items-center gap-1.5 shadow-sm">
                            <span className="text-[10px] text-muted-foreground uppercase font-mono mr-2">Agent is typing</span>
                            <div className="typing-dots flex gap-1">
                              <span />
                              <span />
                              <span />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chat inputs */}
                    <form onSubmit={handleChatSubmit} className="p-3 border-t border-border bg-card flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Ask coordinator: 'What is our OEE/health?' or 'Any low stock alerts?'..."
                        className="flex-1 bg-background border border-border rounded-lg px-4 py-2.5 text-xs focus:outline-none focus:border-primary text-foreground transition-colors"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        disabled={isStreaming}
                      />
                      <button 
                        type="submit" 
                        disabled={isStreaming || !chatInput.trim()}
                        className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 rounded-lg text-xs flex items-center justify-center transition-colors"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </div>

                </div>
              </motion.div>
            )}

            {/* VIEW: FORECASTING */}
            {activeTab === "forecasting" && (
              <motion.div 
                key="forecasting"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 flex-1"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">AI demand & stock forecasting</h2>
                    <p className="text-xs text-muted-foreground">Uses historic sales with exponential smoothing (alpha=0.3) + Gemini analysis context.</p>
                  </div>
                </div>

                <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">6-Month Demand Projection with 80% Confidence Interval Band</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[
                        {month: "Feb", actual: 42, forecast: 42, upper: 42, lower: 42},
                        {month: "Mar", actual: 45, forecast: 46, upper: 50, lower: 42},
                        {month: "Apr", actual: 51, forecast: 49, upper: 55, lower: 43},
                        {month: "May", actual: 0, forecast: 52, upper: 60, lower: 44},
                        {month: "Jun", actual: 0, forecast: 55, upper: 65, lower: 45},
                        {month: "Jul", actual: 0, forecast: 58, upper: 70, lower: 46}
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" stroke="var(--muted-foreground)" style={{ fontSize: 10 }} />
                        <YAxis stroke="var(--muted-foreground)" style={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }} />
                        <Legend />
                        <Area name="Confidence Bounds (80%)" dataKey="upper" stroke="none" fill="#0ea5e9" fillOpacity={0.1} />
                        <Area name="Confidence Lower" dataKey="lower" stroke="none" fill="none" />
                        <Line name="Projected Forecast (Tons)" type="monotone" dataKey="forecast" stroke="#0ea5e9" strokeWidth={2.5} dot={true} />
                        <Line name="Actual Sales" type="monotone" dataKey="actual" stroke="#22c55e" strokeWidth={2} dot={true} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </motion.div>
            )}

            {/* VIEW: REPORTS GENERATOR */}
            {activeTab === "reports" && (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 flex-1"
              >
                <div>
                  <h2 className="text-xl font-bold tracking-tight">System Report Generator</h2>
                  <p className="text-xs text-muted-foreground">Export full operational digests directly in PDF, Excel or CSV format.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Template selections */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Select Template</h3>
                    
                    <div className="space-y-3">
                      <div className="border border-border hover:border-primary p-4 rounded-xl cursor-pointer bg-background/50 flex flex-col gap-1 transition-colors">
                        <span className="text-xs font-bold">Daily Production Summary</span>
                        <span className="text-[11px] text-muted-foreground">Detailed extrusion meters, OEE grid status, and shift downtime.</span>
                        <div className="flex gap-2 mt-4">
                          <button onClick={() => handleDownloadReport("daily_production", "pdf")} className="bg-primary text-primary-foreground font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> PDF
                          </button>
                          <button onClick={() => handleDownloadReport("daily_production", "excel")} className="bg-green-500 text-zinc-950 font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> Excel
                          </button>
                          <button onClick={() => handleDownloadReport("daily_production", "csv")} className="bg-neutral-800 text-neutral-300 font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> CSV
                          </button>
                        </div>
                      </div>

                      <div className="border border-border hover:border-primary p-4 rounded-xl cursor-pointer bg-background/50 flex flex-col gap-1 transition-colors">
                        <span className="text-xs font-bold">Weekly Operations Digest</span>
                        <span className="text-[11px] text-muted-foreground">Average quality pass rates, material reorders, and fuel energy load factor.</span>
                        <div className="flex gap-2 mt-4">
                          <button onClick={() => handleDownloadReport("weekly_summary", "pdf")} className="bg-primary text-primary-foreground font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> PDF
                          </button>
                          <button onClick={() => handleDownloadReport("weekly_summary", "excel")} className="bg-green-500 text-zinc-950 font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> Excel
                          </button>
                        </div>
                      </div>

                      <div className="border border-border hover:border-primary p-4 rounded-xl cursor-pointer bg-background/50 flex flex-col gap-1 transition-colors">
                        <span className="text-xs font-bold">Monthly Financial Margin</span>
                        <span className="text-[11px] text-muted-foreground">MTD gross sales revenue, production margins cost per ton variance report.</span>
                        <div className="flex gap-2 mt-4">
                          <button onClick={() => handleDownloadReport("monthly_financial", "pdf")} className="bg-primary text-primary-foreground font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> PDF
                          </button>
                          <button onClick={() => handleDownloadReport("monthly_financial", "excel")} className="bg-green-500 text-zinc-950 font-semibold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition-colors">
                            <Download className="h-3 w-3" /> Excel
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Informational help */}
                  <div className="bg-card border border-border p-6 rounded-xl shadow-sm flex flex-col justify-between">
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Report Engine Metadata</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        The reports generated retrieve direct collection metrics and bundle them via local Python generator services. All PDF sheets are constructed dynamically utilizing the <b>ReportLab</b> vector canvas, ensuring pixel-perfect alignments and standard headers.
                      </p>
                      <div className="bg-background border border-border p-4 rounded-xl text-xs space-y-2">
                        <div className="font-semibold text-primary">Report Document Header:</div>
                        <div className="font-mono text-muted-foreground text-[10px]">
                          PVCPilot AI — Manufacturing Intelligence Platform<br />
                          Generated by PVCPilot AI
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-4 mt-6 text-center text-xs text-muted-foreground font-medium">
                      PVCPilot AI © {new Date().getFullYear()}
                    </div>
                  </div>

                </div>
              </motion.div>
            )}

          </AnimatePresence>

          {/* Footer branding */}
          <AppFooter />

        </main>
      </div>

      {/* 4. NEW WORK ORDER MODAL WINDOW */}
      <AnimatePresence>
        {showNewWOModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-border w-full max-w-md p-6 rounded-2xl shadow-xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-border pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider">Schedule New Extruder Run</h3>
                <button 
                  onClick={() => setShowNewWOModal(false)}
                  className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateWorkOrder} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-muted-foreground block mb-1">Pipe Diameter (mm)</label>
                  <select 
                    value={newWODiameter} 
                    onChange={(e) => setNewWODiameter(e.target.value)}
                    className="w-full bg-background border border-border text-foreground px-3 py-2 rounded-lg"
                  >
                    <option value="63">63 mm PN10</option>
                    <option value="90">90 mm PN10</option>
                    <option value="110">110 mm PN10</option>
                    <option value="160">160 mm PN10</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground block mb-1">Quantity Target (Meters)</label>
                  <input 
                    type="number" 
                    required 
                    min="100"
                    className="w-full bg-background border border-border text-foreground px-3 py-2 rounded-lg"
                    value={newWOQuantity}
                    onChange={(e) => setNewWOQuantity(e.target.value)}
                  />
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground block mb-1">Assign Extruder Line</label>
                  <select 
                    value={newWOMachine} 
                    onChange={(e) => setNewWOMachine(e.target.value)}
                    className="w-full bg-background border border-border text-foreground px-3 py-2 rounded-lg"
                  >
                    {machines.filter(m => m.type === "extruder").map((ext) => (
                      <option key={ext.id} value={ext.id}>{ext.machine_code} ({ext.location})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="font-semibold text-muted-foreground block mb-1">Production Shift</label>
                    <select 
                      value={newWOShift} 
                      onChange={(e) => setNewWOShift(e.target.value)}
                      className="w-full bg-background border border-border text-foreground px-3 py-2 rounded-lg"
                    >
                      <option value="morning">Morning Shift</option>
                      <option value="afternoon">Afternoon Shift</option>
                      <option value="night">Night Shift</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-muted-foreground block mb-1">Run Priority</label>
                    <select 
                      value={newWOPriority} 
                      onChange={(e) => setNewWOPriority(e.target.value)}
                      className="w-full bg-background border border-border text-foreground px-3 py-2 rounded-lg"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-2.5 rounded-lg mt-6 shadow-sm transition-all"
                >
                  Confirm and Reserve Stock
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// Simple decimal rounding helper
function round(value: any, decimals: number): number {
  if (value === undefined || value === null) return 0;
  const num = Number(value);
  return Number(num.toFixed(decimals));
}
