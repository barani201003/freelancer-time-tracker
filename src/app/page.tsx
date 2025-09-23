"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Download, FileText, Play, Square, TimerReset, Plus, Pencil, Trash2 } from "lucide-react";

// Types
type ID = string;

type Client = {
  id: ID;
  name: string;
  email?: string;
  rate?: number; // default hourly rate
  color?: string;
  active: boolean;
};

type Project = {
  id: ID;
  clientId: ID;
  name: string;
  rate?: number; // overrides client rate when present
  color?: string;
  archived: boolean;
};

type TimeEntry = {
  id: ID;
  clientId: ID;
  projectId: ID;
  start: number; // epoch ms
  end?: number; // epoch ms
  durationMs: number; // computed
  notes?: string;
  tags?: string[];
  billable: boolean;
};

type Invoice = {
  id: ID;
  number: string;
  clientId: ID;
  date: string; // ISO date
  dueDate?: string; // ISO date
  taxRate?: number; // percent
  status: "draft" | "sent" | "paid" | "overdue";
  lineItems: Array<{
    projectId: ID;
    description: string;
    hours: number;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
};

type AppState = {
  clients: Client[];
  projects: Project[];
  entries: TimeEntry[];
  invoices: Invoice[];
  runningTimer?: {
    clientId?: ID;
    projectId?: ID;
    notes?: string;
    billable: boolean;
    start: number; // epoch ms
  } | null;
};

type Action =
  | { type: "INIT"; payload: AppState }
  | { type: "ADD_CLIENT"; payload: Client }
  | { type: "UPDATE_CLIENT"; payload: Client }
  | { type: "DELETE_CLIENT"; payload: { id: ID } }
  | { type: "ADD_PROJECT"; payload: Project }
  | { type: "UPDATE_PROJECT"; payload: Project }
  | { type: "DELETE_PROJECT"; payload: { id: ID } }
  | { type: "ADD_ENTRY"; payload: TimeEntry }
  | { type: "UPDATE_ENTRY"; payload: TimeEntry }
  | { type: "DELETE_ENTRY"; payload: { id: ID } }
  | { type: "START_TIMER"; payload: { clientId?: ID; projectId?: ID; notes?: string; billable: boolean; start: number } }
  | { type: "STOP_TIMER"; payload: { end: number } }
  | { type: "RESET_TIMER" }
  | { type: "ADD_INVOICE"; payload: Invoice }
  | { type: "UPDATE_INVOICE"; payload: Invoice }
  | { type: "DELETE_INVOICE"; payload: { id: ID } };

const STORAGE_KEY = "freelance-time-tracker:v1";

function uid(prefix = "id"): ID {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function loadState(): AppState {
  if (typeof window === "undefined")
    return { clients: [], projects: [], entries: [], invoices: [], runningTimer: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { clients: [], projects: [], entries: [], invoices: [], runningTimer: null };
    const parsed = JSON.parse(raw) as AppState;
    return { runningTimer: null, ...parsed };
  } catch {
    return { clients: [], projects: [], entries: [], invoices: [], runningTimer: null };
  }
}

function persistState(state: AppState) {
  try {
    const { runningTimer, ...rest } = state; // persist timer too, but keep as is
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, runningTimer }));
  } catch {}
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "INIT":
      return { ...state, ...action.payload };
    case "ADD_CLIENT":
      return { ...state, clients: [action.payload, ...state.clients] };
    case "UPDATE_CLIENT":
      return { ...state, clients: state.clients.map((c) => (c.id === action.payload.id ? action.payload : c)) };
    case "DELETE_CLIENT":
      return {
        ...state,
        projects: state.projects.filter((p) => p.clientId !== action.payload.id),
        entries: state.entries.filter((e) => e.clientId !== action.payload.id),
        clients: state.clients.filter((c) => c.id !== action.payload.id),
      };
    case "ADD_PROJECT":
      return { ...state, projects: [action.payload, ...state.projects] };
    case "UPDATE_PROJECT":
      return { ...state, projects: state.projects.map((p) => (p.id === action.payload.id ? action.payload : p)) };
    case "DELETE_PROJECT":
      return { ...state, entries: state.entries.filter((e) => e.projectId !== action.payload.id), projects: state.projects.filter((p) => p.id !== action.payload.id) };
    case "ADD_ENTRY":
      return { ...state, entries: [action.payload, ...state.entries] };
    case "UPDATE_ENTRY":
      return { ...state, entries: state.entries.map((e) => (e.id === action.payload.id ? action.payload : e)) };
    case "DELETE_ENTRY":
      return { ...state, entries: state.entries.filter((e) => e.id !== action.payload.id) };
    case "START_TIMER":
      return { ...state, runningTimer: { ...action.payload } };
    case "STOP_TIMER": {
      if (!state.runningTimer) return state;
      const { clientId, projectId, notes, billable, start } = state.runningTimer;
      const end = action.payload.end;
      const durationMs = Math.max(0, end - start);
      const entry: TimeEntry = {
        id: uid("entry"),
        clientId: clientId || "unassigned_client",
        projectId: projectId || "unassigned_project",
        start,
        end,
        durationMs,
        notes,
        tags: [],
        billable,
      };
      return { ...state, runningTimer: null, entries: [entry, ...state.entries] };
    }
    case "RESET_TIMER":
      return { ...state, runningTimer: null };
    case "ADD_INVOICE":
      return { ...state, invoices: [action.payload, ...state.invoices] };
    case "UPDATE_INVOICE":
      return { ...state, invoices: state.invoices.map((i) => (i.id === action.payload.id ? action.payload : i)) };
    case "DELETE_INVOICE":
      return { ...state, invoices: state.invoices.filter((i) => i.id !== action.payload.id) };
    default:
      return state;
  }
}

function msToHMS(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function hoursFromMs(ms: number) {
  return +(ms / 1000 / 3600).toFixed(2);
}

function download(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as AppState, loadState);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    persistState(state);
  }, [state]);

  // Timer ticking UI
  const [, forceTick] = useState(0);
  const tickRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.runningTimer) {
      tickRef.current = window.setInterval(() => forceTick((v) => v + 1), 1000);
    }
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [state.runningTimer]);

  // Derived maps
  const clientMap = useMemo(() => new Map(state.clients.map((c) => [c.id, c])), [state.clients]);
  const projectMap = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);

  // Dashboard form state
  const [selClient, setSelClient] = useState<ID | undefined>();
  const [selProject, setSelProject] = useState<ID | undefined>();
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(true);

  useEffect(() => {
    // Reset project when client changes
    setSelProject(undefined);
  }, [selClient]);

  const startTimer = () => {
    if (state.runningTimer) return;
    dispatch({ type: "START_TIMER", payload: { clientId: selClient, projectId: selProject, notes, billable, start: Date.now() } });
  };

  const stopTimer = () => {
    if (!state.runningTimer) return;
    dispatch({ type: "STOP_TIMER", payload: { end: Date.now() } });
    setNotes("");
  };

  const resetTimer = () => dispatch({ type: "RESET_TIMER" });

  const currentDuration = state.runningTimer ? Date.now() - state.runningTimer.start : 0;

  // Recent entries
  const recent = state.entries.slice(0, 10);

  // Helpers for rates
  function rateFor(projectId?: ID, clientId?: ID) {
    if (projectId && projectMap.get(projectId)?.rate) return projectMap.get(projectId)!.rate!;
    if (clientId && clientMap.get(clientId)?.rate) return clientMap.get(clientId)!.rate!;
    return 0;
  }

  // CSV export for entries within a range
  function exportEntriesCSV(entries: TimeEntry[], fname = "time-entries.csv") {
    const header = ["Entry ID", "Client", "Project", "Start", "End", "Duration(h)", "Billable", "Notes", "Rate", "Amount"].join(",");
    const rows = entries.map((e) => {
      const client = clientMap.get(e.clientId)?.name || "Unassigned";
      const project = projectMap.get(e.projectId)?.name || "Unassigned";
      const rate = rateFor(e.projectId, e.clientId);
      const amount = +(rate * hoursFromMs(e.durationMs)).toFixed(2);
      return [
        e.id,
        wrap(client),
        wrap(project),
        new Date(e.start).toISOString(),
        e.end ? new Date(e.end).toISOString() : "",
        hoursFromMs(e.durationMs),
        e.billable ? "Yes" : "No",
        wrap(e.notes || ""),
        rate,
        amount,
      ].join(",");
    });
    download(fname, [header, ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function wrap(s: string) {
    const needs = /[",\n]/.test(s);
    return needs ? '"' + s.replaceAll('"', '""') + '"' : s;
  }

  // Simple report aggregations
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const filteredEntries = useMemo(() => {
    const from = fromDate ? new Date(fromDate).getTime() : -Infinity;
    const to = toDate ? new Date(toDate).getTime() + 24 * 3600 * 1000 - 1 : Infinity;
    return state.entries.filter((e) => e.start >= from && (e.end ?? e.start) <= to);
  }, [state.entries, fromDate, toDate]);

  const byClient = useMemo(() => {
    const map = new Map<ID, number>();
    for (const e of filteredEntries) map.set(e.clientId, (map.get(e.clientId) || 0) + e.durationMs);
    return Array.from(map.entries()).map(([clientId, dur]) => ({ clientId, dur }));
  }, [filteredEntries]);

  const byProject = useMemo(() => {
    const map = new Map<ID, number>();
    for (const e of filteredEntries) map.set(e.projectId, (map.get(e.projectId) || 0) + e.durationMs);
    return Array.from(map.entries()).map(([projectId, dur]) => ({ projectId, dur }));
  }, [filteredEntries]);

  // Invoice generation
  const [invoiceClient, setInvoiceClient] = useState<ID | undefined>();
  const [invoiceFrom, setInvoiceFrom] = useState<string>("");
  const [invoiceTo, setInvoiceTo] = useState<string>("");
  const [taxRate, setTaxRate] = useState<number>(0);
  const invoiceEntries = useMemo(() => {
    if (!invoiceClient) return [] as TimeEntry[];
    const from = invoiceFrom ? new Date(invoiceFrom).getTime() : -Infinity;
    const to = invoiceTo ? new Date(invoiceTo).getTime() + 24 * 3600 * 1000 - 1 : Infinity;
    return state.entries.filter((e) => e.clientId === invoiceClient && e.billable && e.start >= from && (e.end ?? e.start) <= to);
  }, [state.entries, invoiceClient, invoiceFrom, invoiceTo]);

  const invoiceLines = useMemo(() => {
    const map = new Map<ID, { hours: number; rate: number; name: string }>();
    for (const e of invoiceEntries) {
      const rate = rateFor(e.projectId, e.clientId);
      const hours = hoursFromMs(e.durationMs);
      const projectName = projectMap.get(e.projectId)?.name || "Unassigned";
      const prev = map.get(e.projectId) || { hours: 0, rate, name: projectName };
      map.set(e.projectId, { hours: prev.hours + hours, rate: rate || prev.rate, name: projectName });
    }
    return Array.from(map.entries()).map(([projectId, v]) => ({
      projectId,
      description: `Work on ${v.name}`,
      hours: +v.hours.toFixed(2),
      rate: v.rate || 0,
      amount: +(v.hours * (v.rate || 0)).toFixed(2),
    }));
  }, [invoiceEntries, projectMap]);

  const invoiceSubtotal = useMemo(() => invoiceLines.reduce((sum, l) => sum + l.amount, 0), [invoiceLines]);
  const invoiceTax = useMemo(() => +(invoiceSubtotal * (taxRate / 100)).toFixed(2), [invoiceSubtotal, taxRate]);
  const invoiceTotal = useMemo(() => +(invoiceSubtotal + invoiceTax).toFixed(2), [invoiceSubtotal, invoiceTax]);

  function createInvoice() {
    if (!invoiceClient) {
      window.alert("Select a client for the invoice.");
      return;
    }
    const invoice: Invoice = {
      id: uid("inv"),
      number: `INV-${new Date().getFullYear()}-${(state.invoices.length + 1).toString().padStart(4, "0")}`,
      clientId: invoiceClient,
      date: new Date().toISOString().slice(0, 10),
      dueDate: invoiceTo || undefined,
      taxRate,
      status: "draft",
      lineItems: invoiceLines,
      subtotal: +invoiceSubtotal.toFixed(2),
      tax: +invoiceTax.toFixed(2),
      total: +invoiceTotal.toFixed(2),
    };
    dispatch({ type: "ADD_INVOICE", payload: invoice });
    window.alert("Invoice created. Use Print to export as PDF.");
  }

  function printElementById(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Print</title><style>
      body{font-family:ui-sans-serif,system-ui; padding:24px;}
      table{width:100%; border-collapse: collapse;}
      th,td{border:1px solid #ddd; padding:8px; text-align:left}
      th{background:#f3f4f6}
    </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  // CRUD dialogs state
  const [clientDialog, setClientDialog] = useState<{ open: boolean; edit?: Client | null }>({ open: false, edit: null });
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; edit?: Project | null }>({ open: false, edit: null });
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; edit?: TimeEntry | null }>({ open: false, edit: null });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Freelancer Time Tracker</h1>
          <p className="text-sm text-muted-foreground">Track time, manage projects, create invoices.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          <Button variant="outline" asChild>
            <Link href="#" onClick={(e) => { e.preventDefault(); exportEntriesCSV(state.entries); }}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Link>
          </Button>
          <Button variant="outline" onClick={() => printElementById("invoice-preview")}>
            <FileText className="h-4 w-4 mr-2" /> Print Invoice
          </Button>
        </div>
      </header>

      <Separator className="my-6" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap gap-2">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="projects">Clients & Projects</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Timer</CardTitle>
                <CardDescription>Track billable time with one click.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="mb-2 block">Client</Label>
                    <Select value={selClient} onValueChange={setSelClient}>
                      <SelectTrigger id="client-select">
                        <SelectValue placeholder="Select client" />
                      </SelectTrigger>
                      <SelectContent>
                        {state.clients.length === 0 && (
                          <div className="px-2 py-1 text-sm text-muted-foreground">No clients yet</div>
                        )}
                        {state.clients.filter((c) => c.active).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-2 block">Project</Label>
                    <Select value={selProject} onValueChange={setSelProject}>
                      <SelectTrigger id="project-select">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {state.projects
                          .filter((p) => !p.archived && (!selClient || p.clientId === selClient))
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label className="mb-2 block">Billable</Label>
                      <div className="flex items-center gap-2">
                        <Switch checked={billable} onCheckedChange={setBillable} id="billable-switch" />
                        <Label htmlFor="billable-switch">Billable time</Label>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What are you working on?" rows={3} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-4xl font-mono tabular-nums">{msToHMS(currentDuration)}</div>
                  <div className="flex items-center gap-2">
                    {!state.runningTimer ? (
                      <Button onClick={startTimer}>
                        <Play className="h-4 w-4 mr-2" /> Start
                      </Button>
                    ) : (
                      <Button variant="destructive" onClick={stopTimer}>
                        <Square className="h-4 w-4 mr-2" /> Stop & Save
                      </Button>
                    )}
                    <Button variant="outline" onClick={resetTimer} disabled={!state.runningTimer}>
                      <TimerReset className="h-4 w-4 mr-2" /> Reset
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Add</CardTitle>
                <CardDescription>Create clients and projects.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="flex-1" variant="outline" onClick={() => setClientDialog({ open: true })}>
                    <Plus className="h-4 w-4 mr-2" /> New Client
                  </Button>
                  <Button className="flex-1" variant="outline" onClick={() => setProjectDialog({ open: true })}>
                    <Plus className="h-4 w-4 mr-2" /> New Project
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1200&auto=format&fit=crop"
                    alt="Workspace"
                    className="w-full h-40 object-cover"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>Recent Time Entries</CardTitle>
                  <CardDescription>Your latest work logs.</CardDescription>
                </div>
                <Button variant="outline" onClick={() => setEntryDialog({ open: true, edit: null })}>
                  <Plus className="h-4 w-4 mr-2" /> Manual Entry
                </Button>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Billable</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recent.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No entries yet. Start the timer to create your first entry.
                          </TableCell>
                        </TableRow>
                      )}
                      {recent.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{new Date(e.start).toLocaleString()}</TableCell>
                          <TableCell>{clientMap.get(e.clientId)?.name || "Unassigned"}</TableCell>
                          <TableCell>{projectMap.get(e.projectId)?.name || "Unassigned"}</TableCell>
                          <TableCell>{msToHMS(e.durationMs)}</TableCell>
                          <TableCell>
                            {e.billable ? <Badge>Billable</Badge> : <Badge variant="secondary">Non-billable</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => setEntryDialog({ open: true, edit: e })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => dispatch({ type: "DELETE_ENTRY", payload: { id: e.id } })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients & Projects */}
        <TabsContent value="projects" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>Clients</CardTitle>
                  <CardDescription>Manage your clients.</CardDescription>
                </div>
                <Button onClick={() => setClientDialog({ open: true })} variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> New Client
                </Button>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.clients.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">No clients</TableCell>
                        </TableRow>
                      )}
                      {state.clients.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.name}</TableCell>
                          <TableCell>{c.email || "—"}</TableCell>
                          <TableCell>${c.rate ?? 0}/hr</TableCell>
                          <TableCell>{c.active ? <Badge>Active</Badge> : <Badge variant="secondary">Archived</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => setClientDialog({ open: true, edit: c })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => dispatch({ type: "DELETE_CLIENT", payload: { id: c.id } })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <CardTitle>Projects</CardTitle>
                  <CardDescription>Manage your projects.</CardDescription>
                </div>
                <Button onClick={() => setProjectDialog({ open: true })} variant="outline">
                  <Plus className="h-4 w-4 mr-2" /> New Project
                </Button>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.projects.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">No projects</TableCell>
                        </TableRow>
                      )}
                      {state.projects.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell>{clientMap.get(p.clientId)?.name || "—"}</TableCell>
                          <TableCell>${p.rate ?? clientMap.get(p.clientId)?.rate ?? 0}/hr</TableCell>
                          <TableCell>{!p.archived ? <Badge>Active</Badge> : <Badge variant="secondary">Archived</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => setProjectDialog({ open: true, edit: p })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => dispatch({ type: "DELETE_PROJECT", payload: { id: p.id } })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Reports</CardTitle>
              <CardDescription>Summaries and exports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="mb-2 block">From</Label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block">To</Label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-end gap-2">
                  <Button className="w-full sm:w-auto" variant="outline" onClick={() => exportEntriesCSV(filteredEntries, "time-report.csv")}>
                    <Download className="h-4 w-4 mr-2" /> Export CSV
                  </Button>
                  <Button className="w-full sm:w-auto" variant="outline" onClick={() => printElementById("report-preview") }>
                    <FileText className="h-4 w-4 mr-2" /> Print PDF
                  </Button>
                </div>
              </div>

              <div id="report-preview" className="space-y-6">
                <section>
                  <h3 className="text-lg font-semibold mb-2">By Client</h3>
                  <div className="space-y-2">
                    {byClient.length === 0 && <p className="text-sm text-muted-foreground">No data in range.</p>}
                    {byClient.map(({ clientId, dur }) => (
                      <div key={clientId} className="flex items-center gap-3">
                        <div className="w-40 text-sm">{clientMap.get(clientId)?.name || "Unassigned"}</div>
                        <div className="flex-1 bg-secondary h-2 rounded">
                          <div
                            className="bg-primary h-2 rounded"
                            style={{ width: `${Math.min(100, (dur / Math.max(1, Math.max(...byClient.map((x) => x.dur)))) ) * 100}%` }}
                          />
                        </div>
                        <div className="w-24 text-right font-mono text-sm">{hoursFromMs(dur)}h</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold mb-2">By Project</h3>
                  <div className="space-y-2">
                    {byProject.length === 0 && <p className="text-sm text-muted-foreground">No data in range.</p>}
                    {byProject.map(({ projectId, dur }) => (
                      <div key={projectId} className="flex items-center gap-3">
                        <div className="w-40 text-sm">{projectMap.get(projectId)?.name || "Unassigned"}</div>
                        <div className="flex-1 bg-secondary h-2 rounded">
                          <div
                            className="bg-primary h-2 rounded"
                            style={{ width: `${Math.min(100, (dur / Math.max(1, Math.max(...byProject.map((x) => x.dur)))) ) * 100}%` }}
                          />
                        </div>
                        <div className="w-24 text-right font-mono text-sm">{hoursFromMs(dur)}h</div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoices */}
        <TabsContent value="invoices" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Generate Invoice</CardTitle>
                <CardDescription>Build from tracked time.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="mb-2 block">Client</Label>
                  <Select value={invoiceClient} onValueChange={setInvoiceClient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {state.clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-2 block">From</Label>
                    <Input type="date" value={invoiceFrom} onChange={(e) => setInvoiceFrom(e.target.value)} />
                  </div>
                  <div>
                    <Label className="mb-2 block">To</Label>
                    <Input type="date" value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block">Tax Rate (%)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value || 0))}
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button className="w-full sm:flex-1" onClick={createInvoice}>
                    <Plus className="h-4 w-4 mr-2" /> Create Invoice
                  </Button>
                  <Button className="w-full sm:flex-1" variant="outline" onClick={() => printElementById("invoice-preview")}>
                    <FileText className="h-4 w-4 mr-2" /> Print
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Invoice Preview</CardTitle>
                <CardDescription>Printable invoice layout.</CardDescription>
              </CardHeader>
              <CardContent>
                <div id="invoice-preview" className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">Invoice</h2>
                      <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString()}</p>
                    </div>
                    <img
                      src="https://images.unsplash.com/photo-1545239351-1141bd82e8a6?q=80&w=400&auto=format&fit=crop"
                      alt="Logo"
                      className="w-20 h-20 object-cover rounded"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold">Bill To</h3>
                      <p>{invoiceClient ? clientMap.get(invoiceClient)?.name : "Select client"}</p>
                      <p className="text-sm text-muted-foreground">{invoiceClient ? clientMap.get(invoiceClient)?.email : ""}</p>
                    </div>
                    <div className="sm:text-right">
                      <p>
                        Range: {invoiceFrom || "—"} – {invoiceTo || "—"}
                      </p>
                      <p>Tax: {taxRate}%</p>
                    </div>
                  </div>
                  <div>
                    <div className="w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Hours</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoiceLines.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">No billable time</TableCell>
                            </TableRow>
                          )}
                          {invoiceLines.map((l) => (
                            <TableRow key={l.projectId}>
                              <TableCell>{l.description}</TableCell>
                              <TableCell className="text-right">{l.hours}</TableCell>
                              <TableCell className="text-right">${l.rate.toFixed(2)}</TableCell>
                              <TableCell className="text-right">${l.amount.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={3} className="text-right font-medium">Subtotal</TableCell>
                            <TableCell className="text-right">${invoiceSubtotal.toFixed(2)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={3} className="text-right font-medium">Tax</TableCell>
                            <TableCell className="text-right">${invoiceTax.toFixed(2)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                            <TableCell className="text-right font-semibold">${invoiceTotal.toFixed(2)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Saved Invoices</CardTitle>
                <CardDescription>Drafts stored in your browser.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.invoices.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">No invoices yet</TableCell>
                        </TableRow>
                      )}
                      {state.invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.number}</TableCell>
                          <TableCell>{clientMap.get(inv.clientId)?.name || "—"}</TableCell>
                          <TableCell>{inv.date}</TableCell>
                          <TableCell>
                            <Badge variant={inv.status === "draft" ? "secondary" : undefined}>{inv.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => dispatch({ type: "DELETE_INVOICE", payload: { id: inv.id } })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ClientDialog
        open={clientDialog.open}
        client={clientDialog.edit || null}
        onOpenChange={(open) => setClientDialog((s) => ({ ...s, open, edit: open ? s.edit : null }))}
        onSave={(c) => {
          if (clientDialog.edit) dispatch({ type: "UPDATE_CLIENT", payload: c });
          else dispatch({ type: "ADD_CLIENT", payload: c });
          setClientDialog({ open: false, edit: null });
        }}
      />

      <ProjectDialog
        open={projectDialog.open}
        project={projectDialog.edit || null}
        clients={state.clients}
        onOpenChange={(open) => setProjectDialog((s) => ({ ...s, open, edit: open ? s.edit : null }))}
        onSave={(p) => {
          if (projectDialog.edit) dispatch({ type: "UPDATE_PROJECT", payload: p });
          else dispatch({ type: "ADD_PROJECT", payload: p });
          setProjectDialog({ open: false, edit: null });
        }}
      />

      <EntryDialog
        open={entryDialog.open}
        entry={entryDialog.edit || null}
        clients={state.clients}
        projects={state.projects}
        onOpenChange={(open) => setEntryDialog((s) => ({ ...s, open, edit: open ? s.edit : null }))}
        onSave={(e) => {
          const exists = state.entries.some((x) => x.id === e.id);
          dispatch({ type: exists ? "UPDATE_ENTRY" : "ADD_ENTRY", payload: e });
          setEntryDialog({ open: false, edit: null });
        }}
      />
    </div>
  );
}

// Client Dialog
function ClientDialog({ open, client, onOpenChange, onSave }: { open: boolean; client: Client | null; onOpenChange: (o: boolean) => void; onSave: (c: Client) => void }) {
  const [name, setName] = useState(client?.name || "");
  const [email, setEmail] = useState(client?.email || "");
  const [rate, setRate] = useState<number>(client?.rate ?? 0);
  const [active, setActive] = useState<boolean>(client?.active ?? true);

  useEffect(() => {
    setName(client?.name || "");
    setEmail(client?.email || "");
    setRate(client?.rate ?? 0);
    setActive(client?.active ?? true);
  }, [client, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
          </div>
          <div>
            <Label className="mb-2 block">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" />
          </div>
          <div>
            <Label className="mb-2 block">Default Rate ($/hr)</Label>
            <Input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(Number(e.target.value || 0))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} id="client-active" />
            <Label htmlFor="client-active">Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!name.trim()) return;
              const payload: Client = client
                ? { ...client, name: name.trim(), email: email.trim(), rate, active }
                : { id: uid("client"), name: name.trim(), email: email.trim(), rate, active, color: undefined };
              onSave(payload);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Project Dialog
function ProjectDialog({ open, project, clients, onOpenChange, onSave }: { open: boolean; project: Project | null; clients: Client[]; onOpenChange: (o: boolean) => void; onSave: (p: Project) => void }) {
  const [name, setName] = useState(project?.name || "");
  const [clientId, setClientId] = useState<ID>(project?.clientId || clients[0]?.id);
  const [rate, setRate] = useState<number>(project?.rate ?? 0);
  const [archived, setArchived] = useState<boolean>(project?.archived ?? false);

  useEffect(() => {
    setName(project?.name || "");
    setClientId(project?.clientId || clients[0]?.id);
    setRate(project?.rate ?? 0);
    setArchived(project?.archived ?? false);
  }, [project, open, clients]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">Project Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          </div>
          <div>
            <Label className="mb-2 block">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Rate ($/hr, optional)</Label>
            <Input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(Number(e.target.value || 0))} />
            <p className="text-xs text-muted-foreground mt-1">Leave 0 to use client default rate.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={archived} onCheckedChange={setArchived} id="project-archived" />
            <Label htmlFor="project-archived">Archived</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (!name.trim() || !clientId) return;
              const payload: Project = project
                ? { ...project, name: name.trim(), clientId, rate: rate || undefined, archived }
                : { id: uid("project"), name: name.trim(), clientId, rate: rate || undefined, archived, color: undefined };
              onSave(payload);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Entry Dialog
function EntryDialog({ open, entry, clients, projects, onOpenChange, onSave }: { open: boolean; entry: TimeEntry | null; clients: Client[]; projects: Project[]; onOpenChange: (o: boolean) => void; onSave: (e: TimeEntry) => void }) {
  const [clientId, setClientId] = useState<ID | undefined>(entry?.clientId);
  const [projectId, setProjectId] = useState<ID | undefined>(entry?.projectId);
  const [start, setStart] = useState<string>(entry ? new Date(entry.start).toISOString().slice(0, 16) : "");
  const [end, setEnd] = useState<string>(entry?.end ? new Date(entry.end).toISOString().slice(0, 16) : "");
  const [notes, setNotes] = useState<string>(entry?.notes || "");
  const [billable, setBillable] = useState<boolean>(entry?.billable ?? true);

  useEffect(() => {
    setClientId(entry?.clientId);
    setProjectId(entry?.projectId);
    setStart(entry ? new Date(entry.start).toISOString().slice(0, 16) : "");
    setEnd(entry?.end ? new Date(entry.end).toISOString().slice(0, 16) : "");
    setNotes(entry?.notes || "");
    setBillable(entry?.billable ?? true);
  }, [entry, open]);

  const filteredProjects = useMemo(() => projects.filter((p) => !p.archived && (!clientId || p.clientId === clientId)), [projects, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit Time Entry" : "New Time Entry"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="mb-2 block">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {filteredProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2 block">Start</Label>
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="mb-2 block">End</Label>
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-2 block">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <Switch checked={billable} onCheckedChange={setBillable} id="entry-billable" />
            <Label htmlFor="entry-billable">Billable</Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              if (entry) {
                const startMs = start ? new Date(start).getTime() : entry.start;
                const endMs = end ? new Date(end).getTime() : entry.end || entry.start;
                const durationMs = Math.max(0, (endMs || startMs) - startMs);
                onSave({ ...entry, clientId: clientId || entry.clientId, projectId: projectId || entry.projectId, start: startMs, end: endMs, durationMs, notes, billable });
              } else {
                if (!clientId || !projectId || !start) return;
                const startMs = new Date(start).getTime();
                const endMs = end ? new Date(end).getTime() : startMs;
                const durationMs = Math.max(0, endMs - startMs);
                onSave({ id: uid("entry"), clientId, projectId, start: startMs, end: endMs, durationMs, notes, tags: [], billable });
              }
            }}
          >
            {entry ? "Save Changes" : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}