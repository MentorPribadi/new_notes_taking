"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, Brain, ChevronDown, ChevronUp, CornerDownLeft, FilePlus2, Key, ListFilter, MoreVertical, Pin, PinOff, Search, Settings, Trash2 } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type Note = {
  id: string
  title: string
  content: string
  tags: string[]
  category?: string
  pinned: boolean
  archived: boolean
  trashed: boolean
  createdAt: number
  updatedAt: number
}

type SortKey = "updatedAt" | "createdAt" | "title"

const STORAGE_KEY = "notes-v1"
const DEVICE_KEY = "notes-device-id"
const SETTINGS_KEY = "notes-ai-settings"

type AiSettings = {
  geminiKey: string
  autoClassify: boolean
  autoMemory: boolean
  autoMerge: boolean
}

const defaultSettings: AiSettings = {
  geminiKey: "",
  autoClassify: true,
  autoMemory: true,
  autoMerge: true,
}

const now = () => Date.now()

function safeUUID() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36)
}

function useLocalNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Note[]
        if (Array.isArray(parsed)) {
          setNotes(parsed)
        }
      }
    } catch {}
  }, [])

  const saveRef = useRef<number | null>(null)
  useEffect(() => {
    if (!loadedRef.current) return
    if (saveRef.current) window.clearTimeout(saveRef.current)
    saveRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
      } catch {}
    }, 200)
    return () => {
      if (saveRef.current) window.clearTimeout(saveRef.current)
    }
  }, [notes])

  return { notes, setNotes }
}

function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(defaultSettings)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) setSettings({ ...defaultSettings, ...JSON.parse(raw) })
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {}
  }, [settings])
  return { settings, setSettings }
}

export default function Page() {
  return (
    <main className="mx-auto max-w-7xl p-4 md:p-6">
      <NoteApp />
    </main>
  )
}

function NoteApp() {
  const { toast } = useToast()
  const { notes, setNotes } = useLocalNotes()
  const { settings, setSettings } = useAiSettings()

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [initialSynced, setInitialSynced] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const lastPullRef = useRef<number>(0)
  const pushTimerRef = useRef<number | null>(null)

  const [query, setQuery] = useState("")
  const [activeView, setActiveView] = useState<"notes" | "archived" | "trash">("notes")
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)

  const [memoryOpen, setMemoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [memories, setMemories] = useState<any[]>([])
  const [memLoading, setMemLoading] = useState(false)

  // Load or create deviceId
  useEffect(() => {
    try {
      const existing = localStorage.getItem(DEVICE_KEY)
      if (existing) {
        setDeviceId(existing)
      } else {
        const id = safeUUID()
        localStorage.setItem(DEVICE_KEY, id)
        setDeviceId(id)
      }
    } catch {
      const id = safeUUID()
      setDeviceId(id)
    }
  }, [])

  // Ensure a note is selected when available
  useEffect(() => {
    const pool = notes.filter(n => 
      (activeView === "notes" && !n.archived && !n.trashed) ||
      (activeView === "archived" && n.archived && !n.trashed) ||
      (activeView === "trash" && n.trashed)
    )
    if (pool.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !pool.some(n => n.id === selectedId)) {
      const pinned = pool.find(n => n.pinned)
      setSelectedId(pinned ? pinned.id : pool[0].id)
    }
  }, [notes, activeView, selectedId])

  const selectedNote = useMemo(
    () => notes.find(n => n.id === selectedId) ?? null,
    [notes, selectedId]
  )

  const allTags = useMemo(() => {
    const tags = new Map<string, number>()
    for (const n of notes) {
      if (n.trashed) continue
      for (const t of n.tags) {
        tags.set(t, (tags.get(t) ?? 0) + 1)
      }
    }
    return Array.from(tags.entries()).sort((a, b) => b[1] - a[1])
  }, [notes])

  const filteredAndSorted = useMemo(() => {
    let pool = notes.filter((n) => {
      if (activeView === "notes" && (n.archived || n.trashed)) return false
      if (activeView === "archived" && (!n.archived || n.trashed)) return false
      if (activeView === "trash" && !n.trashed) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        (n.category || "").toLowerCase().includes(q)
      )
    })

    const pinBoost = (n: Note) => (activeView === "notes" ? (n.pinned ? 1 : 0) : 0)

    pool.sort((a, b) => {
      let cmp = 0
      if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title)
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number)
      }
      cmp = sortDir === "asc" ? cmp : -cmp
      if (cmp === 0 && activeView === "notes") {
        return pinBoost(b) - pinBoost(a)
      }
      return cmp
    })

    return pool
  }, [notes, activeView, query, sortKey, sortDir])

  // CRUD and updates
  const createNote = useCallback(() => {
    const id = safeUUID()
    const when = now()
    const newNote: Note = {
      id,
      title: "Untitled",
      content: "",
      tags: [],
      category: "",
      pinned: false,
      archived: false,
      trashed: false,
      createdAt: when,
      updatedAt: when,
    }
    setNotes((prev) => [newNote, ...prev])
    setSelectedId(id)
    setActiveView("notes")
    setSidebarOpen(false)
    queueMicrotask(() => toast({ title: "New note created" }))
  }, [setNotes, toast])

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, ...patch, updatedAt: patch.updatedAt ?? now() }
          : n
      )
    )
  }, [setNotes])

  const pinToggle = useCallback((n: Note) => {
    updateNote(n.id, { pinned: !n.pinned })
  }, [updateNote])

  const archiveToggle = useCallback((n: Note) => {
    if (n.trashed) return
    const next = !n.archived
    updateNote(n.id, { archived: next, pinned: next ? false : n.pinned })
    if (next && activeView === "notes") setSelectedId(null)
  }, [activeView, updateNote])

  const trashToggle = useCallback((n: Note) => {
    const next = !n.trashed
    updateNote(n.id, { trashed: next, archived: next ? false : n.archived, pinned: next ? false : n.pinned })
    if (next) setSelectedId(null)
  }, [updateNote])

  const deleteForever = useCallback(async (n: Note) => {
    setNotes(prev => prev.filter(x => x.id !== n.id))
    if (selectedId === n.id) setSelectedId(null)
    toast({ title: "Deleted permanently" })
    try {
      if (deviceId) {
        await fetch(`/api/sync?deviceId=${encodeURIComponent(deviceId)}&id=${encodeURIComponent(n.id)}`, { method: "DELETE" })
      }
    } catch {}
  }, [setNotes, selectedId, toast, deviceId])

  const restoreFromTrash = useCallback((n: Note) => {
    updateNote(n.id, { trashed: false })
    setActiveView("notes")
    setSelectedId(n.id)
    toast({ title: "Note restored" })
  }, [updateNote, toast])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault()
        toast({ title: "Saved" })
      }
      if (meta && e.key.toLowerCase() === "n") {
        e.preventDefault()
        createNote()
      }
      if (meta && e.key.toLowerCase() === "f") {
        e.preventDefault()
        const el = document.getElementById("search-notes") as HTMLInputElement | null
        el?.focus()
      }
      if (e.key === "Escape") setSidebarOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [createNote, toast])

  // ---------- Cloud Sync (unchanged core) ----------
  const pushAll = useCallback(async () => {
    if (!deviceId) return
    try {
      setIsSyncing(true)
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, notes }),
      })
      lastPullRef.current = Date.now()
    } catch (e) {
      console.error("pushAll error", e)
    } finally {
      setIsSyncing(false)
    }
  }, [deviceId, notes])

  function mergeNotesLocal(local: Note[], remote: Note[]) {
    const map = new Map<string, Note>()
    for (const n of local) map.set(n.id, n)
    for (const r of remote) {
      const existing = map.get(r.id)
      if (!existing) map.set(r.id, r)
      else map.set(r.id, existing.updatedAt >= r.updatedAt ? existing : r)
    }
    return Array.from(map.values())
  }

  useEffect(() => {
    if (!deviceId || initialSynced) return
    let cancelled = false
    ;(async () => {
      try {
        setIsSyncing(true)
        const res = await fetch(`/api/sync?deviceId=${encodeURIComponent(deviceId)}`)
        const data = res.ok ? await res.json() : { notes: [] }
        if (cancelled) return
        const merged = mergeNotesLocal(notes, data.notes ?? [])
        setNotes(merged)
        lastPullRef.current = Date.now()
        setInitialSynced(true)
        await pushAll()
      } catch (e) {
        console.error("initial sync failed", e)
      } finally {
        if (!cancelled) setIsSyncing(false)
      }
    })()
    return () => { cancelled = true }
  }, [deviceId, initialSynced, notes, setNotes, pushAll])

  useEffect(() => {
    if (!deviceId || !initialSynced) return
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current)
    pushTimerRef.current = window.setTimeout(() => { pushAll() }, 800)
    return () => { if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current) }
  }, [notes, deviceId, initialSynced, pushAll])

  useEffect(() => {
    if (!deviceId) return
    const i = window.setInterval(async () => {
      try {
        const since = lastPullRef.current || 0
        const res = await fetch(`/api/sync?deviceId=${encodeURIComponent(deviceId)}&since=${since}`)
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.notes) && data.notes.length > 0) {
          setNotes((prev) => mergeNotesLocal(prev, data.notes))
        }
        lastPullRef.current = Date.now()
      } catch {}
    }, 30000)
    return () => window.clearInterval(i)
  }, [deviceId, setNotes])

  // ---------- AI Automation ----------
  const classifyTimer = useRef<number | null>(null)
  const memoryTimer = useRef<number | null>(null)
  const mergeTimer = useRef<number | null>(null)

  // Debounced classify & tag
  useEffect(() => {
    if (!settings.geminiKey || !settings.autoClassify || !selectedNote) return
    if (selectedNote.trashed) return
    if ((selectedNote.content || "").trim().length < 20 && (selectedNote.title || "").trim().length < 3) return

    if (classifyTimer.current) window.clearTimeout(classifyTimer.current)
    classifyTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.geminiKey,
            title: selectedNote.title,
            content: selectedNote.content,
            existingTags: selectedNote.tags,
          })
        })
        if (!res.ok) return
        const data = await res.json() as { category?: string; tags?: string[] }
        if (!data) return

        // Merge category and tags, avoid churn
        const newTags = Array.from(new Set([...(selectedNote.tags || []), ...(data.tags || [])]))
        const newCategory = data.category || selectedNote.category || ""
        // Only update if changed to avoid cycles
        const changed = (newCategory !== (selectedNote.category || "")) || (newTags.join(",") !== (selectedNote.tags || []).join(","))
        if (changed) {
          updateNote(selectedNote.id, { category: newCategory, tags: newTags })
        }
      } catch (e) {
        console.error("auto classify failed", e)
      }
    }, 800)

    return () => { if (classifyTimer.current) window.clearTimeout(classifyTimer.current) }
  }, [selectedNote?.title, selectedNote?.content, settings.geminiKey, settings.autoClassify])

  // Debounced memory extraction
  useEffect(() => {
    if (!settings.geminiKey || !settings.autoMemory || !selectedNote || !deviceId) return
    if (selectedNote.trashed) return
    if ((selectedNote.content || "").trim().length < 40) return

    if (memoryTimer.current) window.clearTimeout(memoryTimer.current)
    memoryTimer.current = window.setTimeout(async () => {
      try {
        await fetch("/api/ai/extract-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.geminiKey,
            deviceId,
            noteId: selectedNote.id,
            content: selectedNote.content
          })
        })
      } catch (e) {
        console.error("memory extraction failed", e)
      }
    }, 1200)

    return () => { if (memoryTimer.current) window.clearTimeout(memoryTimer.current) }
  }, [selectedNote?.content, settings.geminiKey, settings.autoMemory, deviceId])

  // Debounced auto-merge highly similar notes
  useEffect(() => {
    if (!settings.geminiKey || !settings.autoMerge || !selectedNote) return
    if (selectedNote.trashed) return
    if ((selectedNote.title + " " + selectedNote.content).trim().length < 30) return

    if (mergeTimer.current) window.clearTimeout(mergeTimer.current)
    mergeTimer.current = window.setTimeout(async () => {
      try {
        const candidate = findMostSimilar(selectedNote, notes.filter(n => n.id !== selectedNote.id && !n.trashed))
        if (!candidate || candidate.score < 0.88) return

        const res = await fetch("/api/ai/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.geminiKey,
            a: { title: candidate.note.title, content: candidate.note.content, tags: candidate.note.tags },
            b: { title: selectedNote.title, content: selectedNote.content, tags: selectedNote.tags },
          })
        })
        if (!res.ok) return
        const data = await res.json() as { shouldMerge: boolean; title: string; content: string }
        if (!data?.shouldMerge) return

        // Merge into the older note (previous)
        const base = candidate.note.createdAt <= selectedNote.createdAt ? candidate.note : selectedNote
        const other = base.id === candidate.note.id ? selectedNote : candidate.note

        // Update base with merged content
        setNotes(prev => prev.map(n => n.id === base.id ? {
          ...n,
          title: data.title || n.title,
          content: data.content || n.content,
          tags: Array.from(new Set([...(n.tags || []), ...(other.tags || [])])),
          updatedAt: now()
        } : n))

        // Trash the other
        setNotes(prev => prev.map(n => n.id === other.id ? { ...n, trashed: true, pinned: false, archived: false, updatedAt: now() } : n))
        if (selectedId === other.id) setSelectedId(base.id)
        toast({ title: "Notes auto-merged", description: `Merged into "${(data.title || base.title).slice(0, 64)}"` })
      } catch (e) {
        console.error("auto merge failed", e)
      }
    }, 1400)

    return () => { if (mergeTimer.current) window.clearTimeout(mergeTimer.current) }
  }, [selectedNote?.title, selectedNote?.content, notes, settings.geminiKey, settings.autoMerge, selectedId])

  // ---------- Memory viewer ----------
  const loadMemories = useCallback(async () => {
    if (!deviceId) return
    try {
      setMemLoading(true)
      const res = await fetch(`/api/memory?deviceId=${encodeURIComponent(deviceId)}`)
      const data = await res.json()
      setMemories(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      console.error("load memories failed", e)
    } finally {
      setMemLoading(false)
    }
  }, [deviceId])

  useEffect(() => {
    if (memoryOpen) loadMemories()
  }, [memoryOpen, loadMemories])

  async function deleteMemory(id: string) {
    if (!deviceId) return
    try {
      await fetch(`/api/memory?deviceId=${encodeURIComponent(deviceId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" })
      setMemories(ms => ms.filter((m) => m.id !== id))
    } catch {}
  }

  return (
    <div className="grid grid-rows-[auto_1fr] gap-3">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={createNote} className="gap-2">
            <FilePlus2 className="h-4 w-4" />
            <span>New</span>
          </Button>
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as typeof activeView)} className="w-full md:w-auto">
            <TabsList>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
              <TabsTrigger value="trash">Trash</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex w-full items-center gap-2 md:w-[600px]">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search-notes"
              placeholder="Search notes, tags, category..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
              aria-label="Search notes"
            />
          </div>

          <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Brain className="h-4 w-4" />
                Memory
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>App Memory</DialogTitle>
                <DialogDescription>Facts the agent captured from your notes.</DialogDescription>
              </DialogHeader>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Content</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead className="w-20">Importance</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memLoading ? (
                      <TableRow><TableCell colSpan={4}>Loading...</TableCell></TableRow>
                    ) : memories.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-muted-foreground">No memories yet</TableCell></TableRow>
                    ) : (
                      memories.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="align-top">{m.content}</TableCell>
                          <TableCell className="align-top">{m.topic}</TableCell>
                          <TableCell className="align-top">{m.importance}</TableCell>
                          <TableCell className="align-top">
                            <Button size="sm" variant="ghost" onClick={() => deleteMemory(m.id)}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>AI Settings</DialogTitle>
                <DialogDescription>Paste your Gemini API key and toggle automations.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="gemini-key" className="flex items-center gap-2">
                    <Key className="h-4 w-4" /> Gemini API Key
                  </Label>
                  <Input
                    id="gemini-key"
                    type="password"
                    placeholder="Paste your Gemini API key"
                    value={settings.geminiKey}
                    onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value.trim() })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-2"><ListFilter className="h-4 w-4" /> Auto categorize and tag</Label>
                    <p className="text-xs text-muted-foreground">Suggest category and tags as you type.</p>
                  </div>
                  <Switch checked={settings.autoClassify} onCheckedChange={(v) => setSettings({ ...settings, autoClassify: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-2"><Brain className="h-4 w-4" /> Auto memory extraction</Label>
                    <p className="text-xs text-muted-foreground">Store key facts to Memory for later reference.</p>
                  </div>
                  <Switch checked={settings.autoMemory} onCheckedChange={(v) => setSettings({ ...settings, autoMemory: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="flex items-center gap-2"><MergeIcon /> Auto-merge duplicates</Label>
                    <p className="text-xs text-muted-foreground">Detect and merge very similar notes.</p>
                  </div>
                  <Switch checked={settings.autoMerge} onCheckedChange={(v) => setSettings({ ...settings, autoMerge: v })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setSettingsOpen(false)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" className="md:hidden" onClick={() => setSidebarOpen((s) => !s)} aria-expanded={sidebarOpen} aria-controls="note-list">
            {sidebarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="sr-only">Toggle list</span>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <aside
          id="note-list"
          className={cn(
            "rounded-md border",
            "md:block",
            sidebarOpen ? "block" : "hidden md:block"
          )}
          aria-label="Notes list"
        >
          <div className="flex items-center justify-between p-3">
            <div className="text-sm font-medium">Notes ({filteredAndSorted.length})</div>
            <div className="text-xs text-muted-foreground">
              {isSyncing ? "Syncing..." : "Synced"}
            </div>
          </div>
          <Separator />
          <div className="max-h-[70vh] overflow-auto p-2 md:max-h-[calc(100vh-240px)]">
            {filteredAndSorted.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No notes found</div>
            ) : (
              <ul className="space-y-2">
                {filteredAndSorted.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => { setSelectedId(n.id); setSidebarOpen(false) }}
                      className={cn(
                        "w-full rounded-md border p-3 text-left transition-colors hover:bg-accent",
                        selectedId === n.id ? "bg-accent" : "bg-background"
                      )}
                      aria-current={selectedId === n.id ? "true" : "false"}
                    >
                      <div className="flex items-start gap-2">
                        {n.pinned && !n.trashed && !n.archived ? <Pin className="mt-0.5 h-3.5 w-3.5" /> : null}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {n.title || "Untitled"}
                            {n.category ? <span className="ml-2 text-xs text-muted-foreground">[{n.category}]</span> : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{n.content || "Empty note"}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {n.tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                            {n.tags.length > 3 && (
                              <Badge variant="secondary" className="text-[10px]">+{n.tags.length - 3}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-[10px] text-muted-foreground">
                          Updated {timeAgo(n.updatedAt)}
                        </div>
                        <div className="flex items-center gap-1">
                          {!n.trashed && activeView !== "archived" && (
                            <IconAction
                              label={n.pinned ? "Unpin" : "Pin"}
                              onClick={(e) => { e.stopPropagation(); pinToggle(n) }}
                            >
                              {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                            </IconAction>
                          )}
                          {!n.trashed && (
                            <IconAction
                              label={n.archived ? "Unarchive" : "Archive"}
                              onClick={(e) => { e.stopPropagation(); archiveToggle(n) }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </IconAction>
                          )}
                          <IconAction
                            label={n.trashed ? "Restore" : "Trash"}
                            onClick={(e) => { e.stopPropagation(); n.trashed ? restoreFromTrash(n) : trashToggle(n) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconAction>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Separator />
          <div className="p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Popular tags</div>
            <div className="flex flex-wrap gap-1">
              {allTags.length === 0 ? (
                <div className="text-xs text-muted-foreground">No tags yet</div>
              ) : (
                allTags.slice(0, 12).map(([tag, count]) => (
                  <button
                    key={tag}
                    className="rounded-full border px-2 py-1 text-xs hover:bg-accent"
                    onClick={() => setQuery(tag)}
                    aria-label={`Filter by tag ${tag}`}
                    title={`Filter by tag ${tag}`}
                  >
                    {tag} <span className="text-muted-foreground">({count})</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <article className="min-h-[60vh] rounded-md border">
          {selectedNote ? (
            <Editor
              key={selectedNote.id}
              note={selectedNote}
              onChangeTitle={(v) => updateNote(selectedNote.id, { title: v })}
              onChangeContent={(v) => updateNote(selectedNote.id, { content: v })}
              onAddTag={(t) => {
                const tag = t.trim()
                if (!tag) return
                if (!selectedNote.tags.includes(tag)) {
                  updateNote(selectedNote.id, { tags: [...selectedNote.tags, tag] })
                }
              }}
              onRemoveTag={(t) => {
                updateNote(selectedNote.id, { tags: selectedNote.tags.filter(x => x !== t) })
              }}
              onPin={() => pinToggle(selectedNote)}
              onArchive={() => archiveToggle(selectedNote)}
              onTrash={() => trashToggle(selectedNote)}
              onDeleteForever={() => deleteForever(selectedNote)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-muted-foreground">
              <p className="text-sm">Select a note to start editing</p>
              <Button onClick={createNote} className="gap-2">
                <FilePlus2 className="h-4 w-4" />
                New note
              </Button>
            </div>
          )}
        </article>
      </section>
    </div>
  )
}

function Editor(props: {
  note: Note
  onChangeTitle: (v: string) => void
  onChangeContent: (v: string) => void
  onAddTag: (v: string) => void
  onRemoveTag: (v: string) => void
  onPin: () => void
  onArchive: () => void
  onTrash: () => void
  onDeleteForever: () => void
}) {
  const {
    note,
    onChangeTitle,
    onChangeContent,
    onAddTag,
    onRemoveTag,
    onPin,
    onArchive,
    onTrash,
    onDeleteForever,
  } = props

  const [tagInput, setTagInput] = useState("")
  const tagInputRef = useRef<HTMLInputElement | null>(null)

  const handleTagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault()
      if (tagInput.trim()) {
        onAddTag(tagInput.trim())
        setTagInput("")
      }
    }
    if (e.key === "Backspace" && tagInput === "" && note.tags.length > 0) {
      onRemoveTag(note.tags[note.tags.length - 1])
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={note.trashed ? "destructive" : note.archived ? "secondary" : "outline"}>
            {note.trashed ? "Trashed" : note.archived ? "Archived" : "Active"}
          </Badge>
          {note.category ? <Badge variant="secondary">{note.category}</Badge> : null}
          <div className="text-xs text-muted-foreground">Created {timeAgo(note.createdAt)}</div>
          <div className="text-xs text-muted-foreground">Updated {timeAgo(note.updatedAt)}</div>
        </div>
        <div className="flex items-center gap-1">
          {!note.trashed && (
            <Button variant="ghost" size="sm" onClick={onPin} className="gap-1">
              {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              <span className="hidden sm:inline">{note.pinned ? "Unpin" : "Pin"}</span>
            </Button>
          )}
          {!note.trashed && (
            <Button variant="ghost" size="sm" onClick={onArchive} className="gap-1">
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">{note.archived ? "Unarchive" : "Archive"}</span>
            </Button>
          )}
          <DropdownActions note={note} onTrash={onTrash} onDeleteForever={onDeleteForever} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <Input
          value={note.title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="Title"
          className="h-11 text-lg"
          aria-label="Note title"
        />
        <div>
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Tags</label>
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
            {note.tags.map((t) => (
              <Badge key={t} variant="secondary" className="group flex items-center gap-1">
                <span>{t}</span>
                <button
                  aria-label={`Remove tag ${t}`}
                  className="rounded p-0.5 hover:bg-muted"
                  onClick={() => onRemoveTag(t)}
                >
                  {"✕"}
                </button>
              </Badge>
            ))}
            <input
              ref={tagInputRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKey}
              placeholder="Add tag and press Enter"
              className="min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Add tag"
            />
          </div>
        </div>
        <div className="flex-1">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Content</label>
          <Textarea
            value={note.content}
            onChange={(e) => onChangeContent(e.target.value)}
            placeholder="Write your note..."
            className="min-h-[40vh] resize-y"
            aria-label="Note content"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl/Cmd + S</kbd> Save
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl/Cmd + N</kbd> New
              </span>
            </div>
            <div className="text-[11px]">{note.content.length} chars</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DropdownActions({
  note,
  onTrash,
  onDeleteForever,
}: {
  note: Note
  onTrash: () => void
  onDeleteForever: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!note.trashed ? (
          <DropdownMenuItem onClick={onTrash} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Move to Trash
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={onTrash} className="gap-2">
              <CornerDownLeft className="h-4 w-4" />
              Restore
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDeleteForever} className="gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              Delete forever
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="rounded p-1 text-muted-foreground hover:bg-accent"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function MergeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7v4a5 5 0 0 0 5 5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 7 4 4M7 7l3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 17l3 3m-3-3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts)
  const min = Math.floor(diff / 60000)
  const hrs = Math.floor(min / 60)
  const days = Math.floor(hrs / 24)
  if (days > 0) return `${days}d ago`
  if (hrs > 0) return `${hrs}h ago`
  if (min > 0) return `${min}m ago`
  return `just now`
}

function findMostSimilar(target: Note, candidates: Note[]) {
  const tx = normalize(target.title + " " + target.content)
  let best: { note: Note; score: number } | null = null
  for (const c of candidates) {
    const cx = normalize(c.title + " " + c.content)
    const s = jaccard(tx, cx)
    if (!best || s > best.score) best = { note: c, score: s }
  }
  return best
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
}

function jaccard(aTokens: string[], bTokens: string[]) {
  const a = new Set(aTokens)
  const b = new Set(bTokens)
  const inter = new Set([...a].filter(x => b.has(x))).size
  const uni = new Set([...a, ...b]).size || 1
  return inter / uni
}
