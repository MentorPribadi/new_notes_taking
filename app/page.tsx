"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, Brain, ChevronDown, ChevronUp, CornerDownLeft, FilePlus2, MoreVertical, Pin, PinOff, Search, Settings, Trash2, MessageSquare, LogOut, User2, Tag } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getBrowserSupabase } from "@/lib/supabase/client"

type Note = {
  id: string
  title: string
  content: string
  tags: string[]
  category?: string
  aiGenerated?: boolean
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
const REMEMBER_UNTIL_KEY = "auth-remember-until"

type AiSettings = {
  geminiKey: string
  autoClassify: boolean
  autoMemory: boolean
  autoMerge: boolean
  tone: string
}

const defaultSettings: AiSettings = {
  geminiKey: "",
  autoClassify: false,
  autoMemory: false,
  autoMerge: false,
  tone: "Make the note more clear and easier to understand. If possible, use bullet points.",
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
    <main className="mx-auto max-w-7xl p-3 md:p-6">
      <NoteApp />
    </main>
  )
}

function NoteApp() {
  const { toast } = useToast()
  const { notes, setNotes } = useLocalNotes()
  const { settings, setSettings } = useAiSettings()
  const supabase = useMemo(() => getBrowserSupabase(), [])
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [initialSynced, setInitialSynced] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const lastPullRef = useRef<number>(0)
  const pushTimerRef = useRef<number | null>(null)

  const [query, setQuery] = useState("")
  const [statusView, setStatusView] = useState<"active" | "archived" | "trash">("active")
  const [domainView, setDomainView] = useState<"manual" | "ai">("manual")
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false)

  const [memoryOpen, setMemoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiSearchOpen, setAiSearchOpen] = useState(false)
  const [memories, setMemories] = useState<any[]>([])
  const [memLoading, setMemLoading] = useState(false)

  // Auth + remember gate
  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const s = data.session
      setSessionEmail(s?.user?.email ?? null)
      setAccessToken(s?.access_token ?? null)

      const until = Number(localStorage.getItem(REMEMBER_UNTIL_KEY) || 0)
      if (s && until && Date.now() > until) {
        supabase.auth.signOut().catch(() => {})
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setSessionEmail(session?.user?.email ?? null)
      setAccessToken(session?.access_token ?? null)
      if (event === "SIGNED_IN") {
        toast({ title: "Signed in", description: session?.user?.email || "" })
      }
      if (event === "SIGNED_OUT") {
        toast({ title: "Signed out" })
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase, toast])

  // If not logged in, redirect to /signup (signup-first UX)
  useEffect(() => {
    if (!sessionEmail) {
      if (typeof window !== "undefined") {
        window.location.href = "/signup"
      }
    }
  }, [sessionEmail])

  // Device ID (memory scoping)
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

  // While redirecting, render nothing
  if (!sessionEmail) {
    return <div className="min-h-[60vh] grid place-items-center text-muted-foreground">Redirecting to sign up…</div>
  }

  // Ensure a note is selected after login
  useEffect(() => {
    const pool = notes.filter((n) => {
      const domainOk = domainView === "ai" ? !!n.aiGenerated : true
      if (!domainOk) return false
      if (statusView === "active" && (n.archived || n.trashed)) return false
      if (statusView === "archived" && (!n.archived || n.trashed)) return false
      if (statusView === "trash" && !n.trashed) return false
      return true
    })
    if (pool.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !pool.some((n) => n.id === selectedId)) {
      const pinned = pool.find((n) => n.pinned)
      setSelectedId(pinned ? pinned.id : pool[0].id)
    }
  }, [notes, statusView, domainView, selectedId])

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId])

  const allTags = useMemo(() => {
    const tags = new Map<string, number>()
    for (const n of notes) {
      if (n.trashed) continue
      for (const t of n.tags) {
        tags.set(t, (tags.get(t) ?? 0) + 1)
      }
    }
    return Array.from(tags.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [notes])

  const allCategories = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of notes) {
      const c = (n.category || "").trim()
      if (!c) continue
      map.set(c, (map.get(c) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c)
  }, [notes])

  const filteredAndSorted = useMemo(() => {
    let pool = notes.filter((n) => {
      const domainOk = domainView === "ai" ? !!n.aiGenerated : true
      if (!domainOk) return false
      if (statusView === "active" && (n.archived || n.trashed)) return false
      if (statusView === "archived" && (!n.archived || n.trashed)) return false
      if (statusView === "trash" && !n.trashed) return false
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        (n.category || "").toLowerCase().includes(q)
      )
    })

    const pinBoost = (n: Note) => (statusView === "active" ? (n.pinned ? 1 : 0) : 0)

    pool.sort((a, b) => {
      let cmp = 0
      if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title)
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number)
      }
      cmp = sortDir === "asc" ? cmp : -cmp
      if (cmp === 0 && statusView === "active") {
        return pinBoost(b) - pinBoost(a)
      }
      return cmp
    })

    return pool
  }, [notes, statusView, domainView, query, sortKey, sortDir])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (selectedNote) {
          pushAll()
          toast({ title: "Saved" })
        }
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
  }, [createNote, toast, selectedNote])

  // ---------- Cloud Sync ----------
  const pushAll = useCallback(async () => {
    if (!accessToken) return
    try {
      setIsSyncing(true)
      await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ notes }),
      })
      lastPullRef.current = Date.now()
    } catch (e) {
      console.error("pushAll error", e)
    } finally {
      setIsSyncing(false)
    }
  }, [notes, accessToken])

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

  // Initial pull
  useEffect(() => {
    if (initialSynced || !accessToken) return
    let cancelled = false
    ;(async () => {
      try {
        setIsSyncing(true)
        const res = await fetch(`/api/sync`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
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
    return () => {
      cancelled = true
    }
  }, [initialSynced, notes, setNotes, pushAll, accessToken])

  // Debounced push on edits
  useEffect(() => {
    if (!initialSynced || !accessToken) return
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current)
    pushTimerRef.current = window.setTimeout(() => {
      pushAll()
    }, 800)
    return () => {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current)
    }
  }, [notes, initialSynced, pushAll, accessToken])

  // Periodic pull
  useEffect(() => {
    if (!accessToken) return
    const i = window.setInterval(async () => {
      try {
        const since = lastPullRef.current || 0
        const res = await fetch(`/api/sync?since=${since}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.notes) && data.notes.length > 0) {
          setNotes((prev) => mergeNotesLocal(prev, data.notes))
        }
        lastPullRef.current = Date.now()
      } catch {}
    }, 30000)
    return () => window.clearInterval(i)
  }, [setNotes, accessToken])

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
      aiGenerated: domainView === "ai" ? true : false,
      pinned: false,
      archived: false,
      trashed: false,
      createdAt: when,
      updatedAt: when,
    }
    setNotes((prev) => [newNote, ...prev])
    setSelectedId(id)
    setStatusView("active")
    setSidebarOpen(false)
    queueMicrotask(() => toast({ title: "New note created" }))
  }, [setNotes, toast, domainView])

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: patch.updatedAt ?? now() } : n)))
    },
    [setNotes]
  )

  const pinToggle = useCallback(
    (n: Note) => {
      updateNote(n.id, { pinned: !n.pinned })
    },
    [updateNote]
  )

  const archiveToggle = useCallback(
    (n: Note) => {
      if (n.trashed) return
      const next = !n.archived
      updateNote(n.id, { archived: next, pinned: next ? false : n.pinned })
      if (next && statusView === "active") {
        setSelectedId(null)
      }
    },
    [statusView, updateNote]
  )

  const trashToggle = useCallback(
    (n: Note) => {
      const next = !n.trashed
      updateNote(n.id, {
        trashed: next,
        archived: next ? false : n.archived,
        pinned: next ? false : n.pinned,
      })
      if (next) setSelectedId(null)
    },
    [updateNote]
  )

  const deleteForever = useCallback(
    async (n: Note) => {
      setNotes((prev) => prev.filter((x) => x.id !== n.id))
      if (selectedId === n.id) setSelectedId(null)
      toast({ title: "Deleted permanently" })
      try {
        await fetch(`/api/sync?id=${encodeURIComponent(n.id)}`, {
          method: "DELETE",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        })
      } catch {}
    },
    [setNotes, selectedId, toast, accessToken]
  )

  const restoreFromTrash = useCallback(
    (n: Note) => {
      updateNote(n.id, { trashed: false })
      setStatusView("active")
      setSelectedId(n.id)
      toast({ title: "Note restored" })
    },
    [updateNote, toast]
  )

  // ---------- Manual AI Save ----------
  const [aiSaving, setAiSaving] = useState(false)
  const aiSave = useCallback(async () => {
    const selectedNote = notes.find((n) => n.id === selectedId)
    if (!selectedNote) return
    if (!settings.geminiKey && !process.env.NEXT_PUBLIC_DUMMY) {
      toast({
        title: "Gemini API key required",
        description: "Open Settings and paste your key to use AI Save.",
      })
      setSettingsOpen(true)
      return
    }
    try {
      setAiSaving(true)

      // Classify & tag
      let classified: { category?: string; tags?: string[] } = {}
      try {
        const r = await fetch("/api/ai/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.geminiKey || undefined,
            title: selectedNote.title,
            content: selectedNote.content,
            existingTags: selectedNote.tags,
          }),
        })
        if (r.ok) classified = await r.json()
      } catch {}

      // Rewrite using tone/instructions
      let rewritten = { title: selectedNote.title, content: selectedNote.content }
      try {
        const rr = await fetch("/api/ai/rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.geminiKey || undefined,
            title: selectedNote.title,
            content: selectedNote.content,
            tone: settings.tone,
          }),
        })
        if (rr.ok) rewritten = await rr.json()
      } catch {}

      // Update original tags/category
      const newTags = Array.from(new Set([...(selectedNote.tags || []), ...((classified.tags as string[]) || [])]))
      const newCategory = classified.category || selectedNote.category || ""
      updateNote(selectedNote.id, {
        tags: newTags,
        category: newCategory,
      })

      // Create AI copy
      const aiId = safeUUID()
      const when = now()
      const aiCopy: Note = {
        ...selectedNote,
        id: aiId,
        title: rewritten.title || selectedNote.title,
        content: rewritten.content || selectedNote.content,
        tags: newTags,
        category: newCategory,
        aiGenerated: true,
        pinned: false,
        archived: false,
        trashed: false,
        createdAt: when,
        updatedAt: when,
      }
      setNotes((prev) => [aiCopy, ...prev])

      // Memories
      if (deviceId) {
        fetch("/api/ai/extract-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: settings.geminiKey || undefined,
            deviceId,
            noteId: aiId,
            content: aiCopy.content,
          }),
        }).catch(() => {})
      }

      setDomainView("ai")
      setStatusView("active")
      setSelectedId(aiId)

      await pushAll()
      toast({ title: "AI Saved", description: "Created AI-enhanced copy and updated tags/category." })
    } catch (e) {
      console.error("AI Save failed", e)
      toast({ title: "AI Save failed", description: "Check your API key and try again.", variant: "destructive" as any })
    } finally {
      setAiSaving(false)
    }
  }, [notes, selectedId, settings.geminiKey, settings.tone, deviceId, updateNote, pushAll, toast])

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
      await fetch(`/api/memory?deviceId=${encodeURIComponent(deviceId)}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      setMemories((ms) => ms.filter((m) => m.id !== id))
    } catch {}
  }

  // ---------- AI Search ----------
  const [searchQuery, setSearchQuery] = useState("")
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<
    { id: string; title: string; snippet: string; reason: string }[]
  >([])

  const runAiSearch = useCallback(async () => {
    if (!settings.geminiKey) {
      toast({
        title: "Gemini API key required",
        description: "Open Settings to paste your key.",
        variant: "destructive" as any,
      })
      setSettingsOpen(true)
      return
    }
    try {
      setSearchLoading(true)
      const aiNotes = notes.filter((n) => n.aiGenerated && !n.trashed)
      const payloadNotes = aiNotes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags,
        category: n.category || "",
      }))
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: settings.geminiKey,
          query: searchQuery,
          notes: payloadNotes,
        }),
      })
      if (!res.ok) {
        setSearchResults([])
        return
      }
      const data = await res.json()
      setSearchResults(Array.isArray(data.results) ? data.results : [])
    } catch (e) {
      console.error("ai search failed", e)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [settings.geminiKey, searchQuery, notes, toast])

  return (
    <div className="grid grid-rows-[auto_1fr] gap-3">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-1">
              <Button
                variant={domainView === "manual" ? "default" : "ghost"}
                onClick={() => setDomainView("manual")}
                className="h-8"
              >
                Notes
              </Button>
              <Button
                variant={domainView === "ai" ? "default" : "ghost"}
                onClick={() => setDomainView("ai")}
                className="h-8"
              >
                AI Notes
              </Button>
            </div>

            <Tabs value={statusView} onValueChange={(v) => setStatusView(v as any)} className="w-full md:w-auto">
              <TabsList className="h-8">
                <TabsTrigger className="h-8" value="active">
                  Active
                </TabsTrigger>
                <TabsTrigger className="h-8" value="archived">
                  Archived
                </TabsTrigger>
                <TabsTrigger className="h-8" value="trash">
                  Trash
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="default" onClick={createNote} className="gap-2 h-8">
              <FilePlus2 className="h-4 w-4" />
              <span>New</span>
            </Button>
          </div>

          <div className="flex w-full items-center gap-2 md:w-[700px]">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search-notes"
                placeholder={`Search ${domainView === "ai" ? "AI notes" : "notes"}, tags, category...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-8"
                aria-label="Search notes"
              />
            </div>

            {domainView === "ai" && (
              <Dialog open={aiSearchOpen} onOpenChange={setAiSearchOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2 h-8">
                    <MessageSquare className="h-4 w-4" />
                    AI Search
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Search AI Notes</DialogTitle>
                    <DialogDescription>Ask: e.g., "find me notes about onboarding checklist"</DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Find me notes about..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <Button onClick={runAiSearch} disabled={searchLoading || !searchQuery.trim()}>
                      {searchLoading ? "Searching..." : "Search"}
                    </Button>
                  </div>
                  <div className="mt-4 max-h-[50vh] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Snippet</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="w-20">Open</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {searchResults.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-muted-foreground">
                              {searchLoading ? "Searching..." : "No results"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          searchResults.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="align-top">{r.title || "(untitled)"}</TableCell>
                              <TableCell className="align-top">{r.snippet}</TableCell>
                              <TableCell className="align-top text-muted-foreground">{r.reason}</TableCell>
                              <TableCell className="align-top">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setAiSearchOpen(false)
                                    setDomainView("ai")
                                    setStatusView("active")
                                    setSelectedId(r.id)
                                  }}
                                >
                                  Open
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Button variant="outline" className="gap-2 h-8" onClick={() => setMemoryOpen(true)}>
              <Brain className="h-4 w-4" />
              Memory
            </Button>

            <Button variant="outline" className="gap-2 h-8" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              Settings
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 h-8">
                  <User2 className="h-4 w-4" />
                  <span className="hidden sm:inline truncate max-w-[140px]">{sessionEmail}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{sessionEmail}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              className="md:hidden h-8"
              onClick={() => setSidebarOpen((s) => !s)}
              aria-expanded={sidebarOpen}
              aria-controls="note-list"
            >
              {sidebarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="sr-only">Toggle list</span>
            </Button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <aside
          id="note-list"
          className={cn("rounded-md border", "md:block", sidebarOpen ? "block" : "hidden md:block")}
          aria-label="Notes list"
        >
          <div className="flex items-center justify-between p-3">
            <div className="text-sm font-medium">
              {domainView === "ai" ? "AI Notes" : "Notes"} ({filteredAndSorted.length})
            </div>
            <div className="text-xs text-muted-foreground">{isSyncing ? "Syncing..." : "Synced"}</div>
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
                      onClick={() => {
                        setSelectedId(n.id)
                        setSidebarOpen(false)
                      }}
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
                            {n.category ? (
                              <span className="ml-2 text-xs text-muted-foreground">[{n.category}]</span>
                            ) : null}
                            {n.aiGenerated ? (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                AI
                              </Badge>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{n.content || "Empty note"}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {n.tags.slice(0, 3).map((t) => (
                              <Badge key={t} variant="secondary" className="text-[10px]">
                                {t}
                              </Badge>
                            ))}
                            {n.tags.length > 3 && (
                              <Badge variant="secondary" className="text-[10px]">
                                +{n.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-[10px] text-muted-foreground">Updated {timeAgo(n.updatedAt)}</div>
                        <div className="flex items-center gap-1">
                          {!n.trashed && statusView !== "archived" && (
                            <IconAction
                              label={n.pinned ? "Unpin" : "Pin"}
                              onClick={(e) => {
                                e.stopPropagation()
                                pinToggle(n)
                              }}
                            >
                              {n.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                            </IconAction>
                          )}
                          {!n.trashed && (
                            <IconAction
                              label={n.archived ? "Unarchive" : "Archive"}
                              onClick={(e) => {
                                e.stopPropagation()
                                archiveToggle(n)
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </IconAction>
                          )}
                          <IconAction
                            label={n.trashed ? "Restore" : "Trash"}
                            onClick={(e) => {
                              e.stopPropagation()
                              n.trashed ? restoreFromTrash(n) : trashToggle(n)
                            }}
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
                allTags.slice(0, 12).map((tag) => (
                  <button
                    key={tag}
                    className="rounded-full border px-2 py-1 text-xs hover:bg-accent"
                    onClick={() => setQuery(tag)}
                    aria-label={`Filter by tag ${tag}`}
                    title={`Filter by tag ${tag}`}
                  >
                    {tag}
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
              onPin={() => pinToggle(selectedNote)}
              onArchive={() => archiveToggle(selectedNote)}
              onTrash={() => trashToggle(selectedNote)}
              onDeleteForever={() => deleteForever(selectedNote)}
              onAiSave={aiSave}
              aiSaving={aiSaving}
              suggestionsTags={allTags}
              suggestionsCategories={allCategories}
              onUpdateInfo={(tags, category) =>
                updateNote(selectedNote.id, {
                  tags: Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))),
                  category: category?.trim() || "",
                })
              }
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

      {/* Memory Dialog */}
      <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
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
                  <TableRow>
                    <TableCell colSpan={4}>Loading...</TableCell>
                  </TableRow>
                ) : memories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No memories yet
                    </TableCell>
                  </TableRow>
                ) : (
                  memories.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="align-top">{m.content}</TableCell>
                      <TableCell className="align-top">{m.topic}</TableCell>
                      <TableCell className="align-top">{m.importance}</TableCell>
                      <TableCell className="align-top">
                        <Button size="sm" variant="ghost" onClick={() => deleteMemory(m.id)}>
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Settings</DialogTitle>
            <DialogDescription>Paste your Gemini API key, choose tone, and toggle automations.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="gemini-key">Gemini API Key</Label>
              <Input
                id="gemini-key"
                type="password"
                placeholder="Paste your Gemini API key"
                value={settings.geminiKey}
                onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value.trim() })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ai-tone">Rewrite tone/instructions</Label>
              <Textarea
                id="ai-tone"
                placeholder="Describe how you'd like the note rewritten..."
                value={settings.tone}
                onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Example: {'"'}Make the note more clear and easier to understand. If possible, use bullet points.{'"'}
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto categorize and tag</Label>
                <p className="text-xs text-muted-foreground">Suggest category and tags as you type.</p>
              </div>
              <Switch
                checked={settings.autoClassify}
                onCheckedChange={(v) => setSettings({ ...settings, autoClassify: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto memory extraction</Label>
                <p className="text-xs text-muted-foreground">Store key facts to Memory for later reference.</p>
              </div>
              <Switch checked={settings.autoMemory} onCheckedChange={(v) => setSettings({ ...settings, autoMemory: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-merge duplicates</Label>
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
    </div>
  )
}

function Editor(props: {
  note: Note
  onChangeTitle: (v: string) => void
  onChangeContent: (v: string) => void
  onPin: () => void
  onArchive: () => void
  onTrash: () => void
  onDeleteForever: () => void
  onAiSave: () => void
  aiSaving: boolean
  suggestionsTags: string[]
  suggestionsCategories: string[]
  onUpdateInfo: (tags: string[], category: string | undefined) => void
}) {
  const [infoOpen, setInfoOpen] = useState(false)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={props.note.trashed ? "destructive" : props.note.archived ? "secondary" : "outline"}>
            {props.note.trashed ? "Trashed" : props.note.archived ? "Archived" : "Active"}
          </Badge>
          {props.note.category ? <Badge variant="secondary">{props.note.category}</Badge> : null}
          {props.note.aiGenerated ? <Badge variant="secondary">AI</Badge> : null}
          <div className="text-xs text-muted-foreground">Created {timeAgo(props.note.createdAt)}</div>
          <div className="text-xs text-muted-foreground">Updated {timeAgo(props.note.updatedAt)}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={props.onAiSave} className="gap-1">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">{props.aiSaving ? "AI Saving..." : "AI Save"}</span>
          </Button>
          {!props.note.trashed && (
            <Button variant="ghost" size="sm" onClick={props.onPin} className="gap-1">
              {props.note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              <span className="hidden sm:inline">{props.note.pinned ? "Unpin" : "Pin"}</span>
            </Button>
          )}
          {!props.note.trashed && (
            <Button variant="ghost" size="sm" onClick={props.onArchive} className="gap-1">
              <Archive className="h-4 w-4" />
              <span className="hidden sm:inline">{props.note.archived ? "Unarchive" : "Archive"}</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setInfoOpen(true)} className="gap-2">
                <Tag className="h-4 w-4" />
                Add info (tags, category)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={props.onTrash} className="gap-2">
                {props.note.trashed ? "Restore" : "Trash"}
                <Trash2 className="h-4 w-4" />
              </DropdownMenuItem>
              {props.note.trashed ? (
                <DropdownMenuItem onClick={props.onDeleteForever} className="gap-2 text-destructive">
                  Delete forever
                  <CornerDownLeft className="h-4 w-4" />
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <Input
          value={props.note.title}
          onChange={(e) => props.onChangeTitle(e.target.value)}
          placeholder="Title"
          className="h-11 text-lg"
          aria-label="Note title"
        />
        <div className="flex-1">
          <label className="mb-2 block text-xs font-medium text-muted-foreground">Content</label>
          <Textarea
            value={props.note.content}
            onChange={(e) => props.onChangeContent(e.target.value)}
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
            <div className="text-[11px]">{props.note.content.length} chars</div>
          </div>
        </div>
      </div>

      <InfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        currentTags={props.note.tags}
        currentCategory={props.note.category || ""}
        suggestionsTags={props.suggestionsTags}
        suggestionsCategories={props.suggestionsCategories}
        onSave={(tags, category) => {
          props.onUpdateInfo(tags, category)
          setInfoOpen(false)
        }}
      />
    </div>
  )
}

function InfoDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentTags: string[]
  currentCategory: string
  suggestionsTags: string[]
  suggestionsCategories: string[]
  onSave: (tags: string[], category: string) => void
}) {
  const [tagsInput, setTagsInput] = useState(props.currentTags.join(", "))
  const [categoryInput, setCategoryInput] = useState(props.currentCategory)

  useEffect(() => {
    if (props.open) {
      setTagsInput(props.currentTags.join(", "))
      setCategoryInput(props.currentCategory)
    }
  }, [props.open, props.currentTags, props.currentCategory])

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add info</DialogTitle>
          <DialogDescription>Add or edit tags and category for this note.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input
              id="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. work, planning, meeting-notes"
              list="all-tags"
            />
            <datalist id="all-tags">
              {props.suggestionsTags.slice(0, 50).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              placeholder="e.g. Projects, Personal, Ideas"
              list="all-categories"
            />
            <datalist id="all-categories">
              {props.suggestionsCategories.slice(0, 50).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              props.onSave(
                tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
                categoryInput
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IconAction(props: { label: string; children: React.ReactNode; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={props.onClick} aria-label={props.label} title={props.label}>
      {props.children}
    </Button>
  )
}

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - ts)
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return "just now"
}
