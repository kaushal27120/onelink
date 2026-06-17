'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getPolishHolidays, getHolidayName } from '@/lib/polish-holidays'

/* ─────────────────────────────────────── types ── */
type DbShift = {
  id: string
  location_id: string
  date: string
  employee_name: string
  employee_id?: string | null
  user_id?: string | null
  time_start: string
  time_end: string
  break_minutes: number
  hourly_rate: number
  hours_worked: number
  labor_cost: number
  status: string
  position?: string | null
  is_posted?: boolean
  accepted_by?: string | null
  accepted_at?: string | null
  is_open_shift?: boolean
}

type ClockInRecord = {
  id: string
  user_id: string
  location_id: string
  work_date: string
  clock_in_at: string | null
  clock_out_at: string | null
  clock_in_photo_url: string | null
  clock_out_photo_url: string | null
}

type ShiftSuggestion = {
  id: string
  employee_id: string | null
  user_id: string | null
  location_id: string
  date: string
  time_start: string | null
  time_end: string | null
  note: string | null
  status: string
  suggestion_type: 'off' | 'available' | 'specific' | null
  created_at: string
  employees?: { full_name: string } | null
}

const SUG_STYLE: Record<string, { cell: string; badge: string }> = {
  off:       { cell: 'border-red-400 bg-red-50 text-red-700 hover:bg-red-100',       badge: 'bg-red-100 text-red-700' },
  available: { cell: 'border-green-400 bg-green-50 text-green-700 hover:bg-green-100', badge: 'bg-green-100 text-green-700' },
  specific:  { cell: 'border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100', badge: 'bg-violet-100 text-violet-700' },
}
const sugStyle = (t: string | null | undefined) => SUG_STYLE[t ?? 'specific'] ?? SUG_STYLE.specific

const SUG_ICON: Record<string, string> = { off: '🚫', available: '✅', specific: '⏰' }
const sugIcon = (t: string | null | undefined) => SUG_ICON[t ?? 'specific'] ?? '💡'
const sugTypeLabel = (t: string | null | undefined) => {
  if (t === 'off') return 'Niedostępny'
  if (t === 'available') return 'Dostępny'
  return 'Konkretne godziny'
}

export type ScheduleEmployee = {
  id: string
  full_name: string
  real_hour_cost?: number | null
  base_rate?: number | null
  user_id?: string | null
  position?: string | null
  phone?: string | null
}

type ModalState = {
  open: boolean
  mode: 'add' | 'edit'
  shift: Partial<DbShift> & { emp_id?: string; publishNow?: boolean; repeatWeeks?: number; isOpenShift?: boolean }
}

type OpenShiftModal = { open: boolean; date: string; time_start: string; time_end: string; position: string; publishNow: boolean }

/* ──────────────────────────────────────── constants ── */
export const POSITIONS: { value: string; label: string; color: string }[] = [
  { value: 'kucharz',  label: 'Kucharz',  color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'kelner',   label: 'Kelner',   color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'kasjer',   label: 'Kasjer',   color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'manager',  label: 'Manager',  color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'zmywak',   label: 'Zmywak',   color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'barista',  label: 'Barista',  color: 'bg-pink-100 text-pink-800 border-pink-300' },
  { value: 'dostawa',  label: 'Dostawa',  color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'inne',     label: 'Inne',     color: 'bg-slate-100 text-slate-700 border-slate-300' },
]
const POSITION_MAP = Object.fromEntries(POSITIONS.map(p => [p.value, p]))
const DEFAULT_COLOR = 'bg-slate-100 text-slate-700 border-slate-300'
const MONTH_NAMES = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień']
const DAY_NAMES_SHORT = ['Pon','Wt','Śr','Czw','Pt','Sob','Nd']

/* ─────────────────────────────────────── helpers ── */
// Use local date components to avoid UTC offset issues (e.g. Poland = UTC+2)
const toLocalISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Parse a YYYY-MM-DD string as LOCAL midnight (not UTC midnight)
const parseLocalDate = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number)
  return new Date(y, m - 1, day)
}

const getWeekStartMonday = (iso: string) => {
  const d = parseLocalDate(iso); const day = d.getDay() || 7
  d.setDate(d.getDate() - (day - 1))
  return toLocalISO(d)
}

const buildWeekDays = (weekStart: string) => {
  if (!weekStart) return []
  const start = parseLocalDate(weekStart)
  const today = toLocalISO(new Date())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i)
    const iso = toLocalISO(d)
    return { iso, label: DAY_NAMES_SHORT[i], dateFull: d.getDate(), month: d.getMonth(), isToday: iso === today, isWeekend: i >= 5 }
  })
}

const buildMonthDays = (year: number, month: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = toLocalISO(new Date())
  return Array.from({ length: daysInMonth }, (_, i) => {
    const d = new Date(year, month, i + 1)
    const iso = toLocalISO(d)
    const dow = d.getDay()
    return { iso, day: i + 1, label: DAY_NAMES_SHORT[(dow === 0 ? 6 : dow - 1)], isToday: iso === today, isWeekend: dow === 0 || dow === 6 }
  })
}

// Break is PAID — do not subtract break from worked hours
const calcHours = (start: string, end: string): number => {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60 // overnight shift (e.g. 22:00 → 03:00)
  return Math.max(0, mins / 60)
}

const fmt = (t?: string | null) => (t ?? '').slice(0, 5)

/* ─────────────────────────────────────── component ── */
export function ScheduleGrid({
  locationId,
  employees,
  supabase,
  userId,
}: {
  locationId: string | undefined
  employees: ScheduleEmployee[]
  supabase: SupabaseClient
  userId?: string
}) {
  const today = new Date().toISOString().split('T')[0]
  const todayDate = new Date()

  // ── view mode ──
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [weekStart, setWeekStart] = useState(getWeekStartMonday(today))
  const [viewYear, setViewYear] = useState(todayDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth())

  const [shifts, setShifts] = useState<DbShift[]>([])
  const [suggestions, setSuggestions] = useState<ShiftSuggestion[]>([])      // period-bounded (for grid cells)
  const [allSuggestions, setAllSuggestions] = useState<ShiftSuggestion[]>([]) // all pending (for tab)
  const [clockIns, setClockIns] = useState<ClockInRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'add', shift: {} })
  const [tab, setTab] = useState<'schedule' | 'suggestions' | 'clockins'>('schedule')
  const [customPositions, setCustomPositions] = useState<{ value: string; label: string; color: string }[]>([])
  const [newPosName, setNewPosName] = useState('')
  const [newPosColor, setNewPosColor] = useState('#6366F1')
  const [savingPos, setSavingPos] = useState(false)
  const [positionColors, setPositionColors] = useState<Record<string, string>>({}) // position_name → hex
  const [showPosPanel, setShowPosPanel] = useState(false)
  const [openShiftModal, setOpenShiftModal] = useState<OpenShiftModal>({ open: false, date: '', time_start: '08:00', time_end: '16:00', position: '', publishNow: false })
  const [savingOpenShift, setSavingOpenShift] = useState(false)

  const weekDays = buildWeekDays(weekStart)
  const weekEnd = weekDays[6]?.iso ?? weekStart
  const monthDays = buildMonthDays(viewYear, viewMonth)
  const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
  const monthEnd = monthDays[monthDays.length - 1]?.iso ?? monthStart

  const periodStart = viewMode === 'week' ? weekStart : monthStart
  const periodEnd   = viewMode === 'week' ? weekEnd : monthEnd
  const displayDays = viewMode === 'week' ? weekDays : monthDays

  /* ── load shifts ── */
  const loadShifts = useCallback(async () => {
    if (!locationId) return
    setLoading(true)
    const [shiftsRes, suggestRes, allSuggestRes, clockRes] = await Promise.all([
      supabase.from('shifts')
        .select('id, location_id, date, employee_name, employee_id, user_id, time_start, time_end, break_minutes, hourly_rate, hours_worked, labor_cost, status, position, is_posted, accepted_by, accepted_at')
        .eq('location_id', locationId)
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('time_start'),
      // Period-bounded suggestions (for grid cell indicators)
      supabase.from('shift_suggestions')
        .select('id, employee_id, user_id, location_id, date, time_start, time_end, note, status, suggestion_type, created_at, employees(full_name)')
        .eq('location_id', locationId)
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('created_at', { ascending: false }),
      // ALL pending suggestions for this location (for the Sugestie tab — no date limit)
      supabase.from('shift_suggestions')
        .select('id, employee_id, user_id, location_id, date, time_start, time_end, note, status, suggestion_type, created_at, employees(full_name)')
        .eq('location_id', locationId)
        .eq('status', 'pending')
        .order('date', { ascending: true }),
      supabase.from('shift_clock_ins')
        .select('id, user_id, location_id, work_date, clock_in_at, clock_out_at, clock_in_photo_url, clock_out_photo_url')
        .eq('location_id', locationId)
        .gte('work_date', periodStart)
        .lte('work_date', periodEnd)
        .order('work_date', { ascending: false }),
    ])
    if (!shiftsRes.error) setShifts(shiftsRes.data ?? [])
    if (!suggestRes.error) setSuggestions(suggestRes.data as unknown as ShiftSuggestion[] ?? [])
    if (!allSuggestRes.error) setAllSuggestions(allSuggestRes.data as unknown as ShiftSuggestion[] ?? [])
    if (!clockRes.error) setClockIns(clockRes.data as ClockInRecord[] ?? [])
    setLoading(false)
  }, [locationId, periodStart, periodEnd, supabase])

  useEffect(() => { loadShifts() }, [loadShifts])

  /* ── load custom positions ── */
  const loadCustomPositions = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('custom_positions').select('name').eq('user_id', userId).order('created_at')
    if (data) {
      setCustomPositions(data.map(r => ({
        value: r.name,
        label: r.name,
        color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      })))
    }
  }, [userId, supabase])

  useEffect(() => { loadCustomPositions() }, [loadCustomPositions])

  /* ── load position colors ── */
  const loadPositionColors = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from('position_colors').select('position_name, color_hex').eq('user_id', userId)
    if (data) {
      const map: Record<string, string> = {}
      data.forEach((r: { position_name: string; color_hex: string }) => { map[r.position_name] = r.color_hex })
      setPositionColors(map)
    }
  }, [userId, supabase])

  useEffect(() => { loadPositionColors() }, [loadPositionColors])

  const savePositionColor = async (posName: string, hex: string) => {
    if (!userId) return
    setPositionColors(prev => ({ ...prev, [posName]: hex }))
    await supabase.from('position_colors').upsert({ user_id: userId, position_name: posName, color_hex: hex }, { onConflict: 'user_id,position_name' })
  }

  /* ── save new custom position ── */
  const saveNewPosition = async () => {
    const name = newPosName.trim()
    if (!name || !userId) return
    setSavingPos(true)
    const { error } = await supabase.from('custom_positions').insert({ user_id: userId, name })
    if (!error) {
      await supabase.from('position_colors').upsert(
        { user_id: userId, position_name: name, color_hex: newPosColor },
        { onConflict: 'user_id,position_name' }
      )
      setPositionColors(prev => ({ ...prev, [name]: newPosColor }))
      setCustomPositions(prev => [...prev, { value: name, label: name, color: '' }])
      setNewPosName('')
      setNewPosColor('#6366F1')
    }
    setSavingPos(false)
  }

  /* ── delete custom position ── */
  const deleteCustomPosition = async (name: string) => {
    if (!userId) return
    await Promise.all([
      supabase.from('custom_positions').delete().eq('user_id', userId).eq('name', name),
      supabase.from('position_colors').delete().eq('user_id', userId).eq('position_name', name),
    ])
    setCustomPositions(prev => prev.filter(p => p.value !== name))
    setPositionColors(prev => { const n = { ...prev }; delete n[name]; return n })
  }

  const allPositions = [...POSITIONS, ...customPositions]
  const posColor = (pos?: string | null) => {
    if (!pos) return DEFAULT_COLOR
    const lower = pos.toLowerCase()
    if (POSITION_MAP[lower]) return POSITION_MAP[lower].color
    const custom = customPositions.find(p => p.value.toLowerCase() === lower)
    return custom?.color ?? DEFAULT_COLOR
  }
  // Returns inline style when a custom hex color override exists for the position
  const posStyle = (pos?: string | null): React.CSSProperties => {
    if (!pos) return {}
    const hex = positionColors[pos] ?? positionColors[pos.toLowerCase()]
    if (!hex) return {}
    return { backgroundColor: hex + '28', color: hex, borderColor: hex + '90' }
  }

  /* ── save open shift ── */
  const saveOpenShift = async () => {
    if (!locationId || !openShiftModal.date || !openShiftModal.time_start || !openShiftModal.time_end) return
    setSavingOpenShift(true)
    await supabase.from('shifts').insert({
      location_id: locationId,
      date: openShiftModal.date,
      employee_name: '',
      time_start: openShiftModal.time_start,
      time_end: openShiftModal.time_end,
      break_minutes: 0,
      hourly_rate: 0,
      hours_worked: calcHours(openShiftModal.time_start, openShiftModal.time_end),
      labor_cost: 0,
      status: 'open',
      position: openShiftModal.position || null,
      is_posted: openShiftModal.publishNow,
      is_open_shift: true,
    })
    setSavingOpenShift(false)
    setOpenShiftModal(m => ({ ...m, open: false }))
    loadShifts()
  }

  /* ── helpers ── */
  const getShifts = (emp: ScheduleEmployee, date: string) =>
    shifts.filter(s => s.employee_id ? s.employee_id === emp.id && s.date === date : s.employee_name === emp.full_name && s.date === date)

  const getPendingSuggestions = (emp: ScheduleEmployee, date: string) =>
    suggestions.filter(s =>
      (s.employee_id === emp.id || (emp.user_id && s.user_id === emp.user_id)) &&
      s.date === date && s.status === 'pending'
    )

  const empRate = (emp: ScheduleEmployee) => emp.base_rate ?? emp.real_hour_cost ?? 0

  const totalPeriodHours = (emp: ScheduleEmployee) =>
    shifts.filter(s => s.employee_id ? s.employee_id === emp.id : s.employee_name === emp.full_name)
      .reduce((acc, s) => acc + calcHours(fmt(s.time_start), fmt(s.time_end)), 0)

  const totalAllHours = employees.reduce((acc, e) => acc + totalPeriodHours(e), 0)
  const draftCount = shifts.filter(s => !s.is_posted).length
  const postedCount = shifts.filter(s => s.is_posted).length

  /* ── post schedule ── */
  const postSchedule = async () => {
    if (!locationId || draftCount === 0) return
    if (!confirm(`Opublikować ${draftCount} zmian? Pracownicy zobaczą grafik w aplikacji.`)) return
    setPosting(true)
    await supabase.from('shifts')
      .update({ is_posted: true })
      .eq('location_id', locationId)
      .eq('is_posted', false)
      .gte('date', periodStart)
      .lte('date', periodEnd)
    setPosting(false)
    loadShifts()
  }

  /* ── suggest approve/reject ── */
  const handleSuggestion = async (id: string, action: 'approved' | 'rejected') => {
    await supabase.from('shift_suggestions').update({ status: action }).eq('id', id)
    loadShifts()
  }

  /* ── convert suggestion to shift ── */
  const acceptSuggestionAsShift = async (sug: ShiftSuggestion) => {
    const emp = employees.find(e => e.id === sug.employee_id)
    if (!emp || !sug.time_start || !sug.time_end) return
    const rate = empRate(emp)
    await supabase.from('shifts').insert({
      location_id: sug.location_id,
      date: sug.date,
      employee_name: emp.full_name,
      employee_id: emp.id,
      user_id: emp.user_id ?? null,
      time_start: sug.time_start,
      time_end: sug.time_end,
      break_minutes: 0,
      hourly_rate: rate,
      status: 'scheduled',
      is_posted: false,
      proposed_by: sug.employee_id,
    })
    await supabase.from('shift_suggestions').update({ status: 'approved' }).eq('id', sug.id)
    loadShifts()
  }

  /* ── modal open ── */
  const openAdd = (emp: ScheduleEmployee, date: string) => setModal({
    open: true, mode: 'add',
    shift: { emp_id: emp.id, employee_name: emp.full_name, user_id: emp.user_id ?? null, date, time_start: '08:00', time_end: '16:00', break_minutes: 0, position: emp.position ?? '' },
  })

  const openEdit = (shift: DbShift) => setModal({
    open: true, mode: 'edit',
    shift: { ...shift, emp_id: shift.employee_id ?? undefined, time_start: fmt(shift.time_start), time_end: fmt(shift.time_end) },
  })

  /* ── save shift ── */
  const saveShift = async () => {
    if (!locationId) return
    const { time_start, time_end, date, employee_name, emp_id } = modal.shift
    if (!time_start || !time_end || !date || !employee_name) { alert('Wypełnij wszystkie wymagane pola'); return }
    const emp = employees.find(e => e.id === emp_id)
    const hourlyRate = empRate(emp ?? { id: '', full_name: '' })

    if (modal.mode === 'add') {
      const weeks = modal.shift.repeatWeeks ?? 0
      const shiftBase = {
        location_id: locationId, employee_name, employee_id: emp_id ?? null,
        user_id: modal.shift.user_id ?? null,
        time_start, time_end, break_minutes: Number(modal.shift.break_minutes ?? 0),
        hourly_rate: hourlyRate, status: 'scheduled', is_posted: modal.shift.publishNow ?? false,
        position: modal.shift.position || null,
      }
      const rows = Array.from({ length: Math.max(1, weeks + 1) }, (_, i) => {
        const d = new Date(date); d.setDate(d.getDate() + i * 7)
        return { ...shiftBase, date: toLocalISO(d) }
      })
      await supabase.from('shifts').insert(rows)
    } else {
      await supabase.from('shifts').update({
        time_start, time_end, break_minutes: Number(modal.shift.break_minutes ?? 0),
        hourly_rate: hourlyRate, position: modal.shift.position || null,
      }).eq('id', modal.shift.id!)
    }
    setModal(m => ({ ...m, open: false }))
    loadShifts()
  }

  const deleteShift = async (id: string) => {
    if (!confirm('Usunąć tę zmianę?')) return
    await supabase.from('shifts').delete().eq('id', id)
    setModal(m => ({ ...m, open: false }))
    loadShifts()
  }

  const navigateWeek = (dir: 1 | -1) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7)
    setWeekStart(d.toISOString().split('T')[0])
  }

  const navigateMonth = (dir: 1 | -1) => {
    let m = viewMonth + dir; let y = viewYear
    if (m > 11) { m = 0; y++ } else if (m < 0) { m = 11; y-- }
    setViewMonth(m); setViewYear(y)
  }

  const modalHours = modal.shift.time_start && modal.shift.time_end
    ? calcHours(modal.shift.time_start, modal.shift.time_end) : 0

  const pendingSuggestions = allSuggestions // already filtered to pending in query

  /* ── Polish holidays ── */
  const holidays = useMemo(() => getPolishHolidays(viewYear), [viewYear])

  /* ── PDF export ── */
  function exportPDF() {
    const title = viewMode === 'week'
      ? `${weekDays[0]?.dateFull} – ${weekDays[6]?.dateFull} ${MONTH_NAMES[weekDays[0]?.month ?? 0]} ${viewYear}`
      : `${MONTH_NAMES[viewMonth]} ${viewYear}`

    const headerCells = displayDays.map(d => {
      const isHol = holidays.has(d.iso)
      const holName = getHolidayName(d.iso, holidays)
      return `<th style="background:${isHol ? '#FEF3C7' : d.isWeekend ? '#F9FAFB' : '#EFF6FF'};padding:6px 4px;font-size:10px;text-align:center;border:1px solid #E5E7EB">
        <div style="font-weight:700">${d.label}</div>
        <div style="font-size:11px">${'day' in d ? d.day : d.dateFull}</div>
        ${isHol ? `<div style="font-size:9px;color:#D97706">${holName}</div>` : ''}
      </th>`
    }).join('')

    const bodyRows = employees.map(emp => {
      const cells = displayDays.map(d => {
        const dayShifts = getShifts(emp, d.iso)
        const isHol = holidays.has(d.iso)
        const content = dayShifts.length
          ? dayShifts.map(s => `<div style="font-size:10px;background:#DBEAFE;border-radius:3px;padding:1px 3px;margin-bottom:2px">${fmt(s.time_start)}–${fmt(s.time_end)}${s.position ? `<br><span style="color:#6B7280">${POSITION_MAP[s.position]?.label ?? s.position}</span>` : ''}</div>`).join('')
          : '<div style="color:#D1D5DB;font-size:10px;text-align:center">—</div>'
        return `<td style="padding:4px;border:1px solid #E5E7EB;vertical-align:top;background:${isHol ? '#FFFBEB' : ''}">${content}</td>`
      }).join('')
      const empHours = displayDays.reduce((sum, d) => sum + getShifts(emp, d.iso).reduce((s, sh) => s + calcHours(fmt(sh.time_start), fmt(sh.time_end)), 0), 0)
      return `<tr>
        <td style="padding:6px 8px;border:1px solid #E5E7EB;font-weight:600;font-size:11px;white-space:nowrap">${emp.full_name}${emp.position ? `<br><span style="color:#9CA3AF;font-weight:400">${emp.position}</span>` : ''}</td>
        ${cells}
        <td style="padding:4px;border:1px solid #E5E7EB;text-align:center;font-weight:700;font-size:11px;color:#059669">${empHours > 0 ? empHours.toFixed(1) + 'h' : '—'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">
      <title>Grafik — ${title}</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
      h1{font-size:16px;font-weight:700;margin-bottom:4px}
      .meta{color:#6B7280;font-size:11px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      @media print{@page{margin:10mm;size:A4 landscape}}</style></head><body>
      <h1>Grafik pracy — ${title}</h1>
      <p class="meta">Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}</p>
      <table>
        <thead><tr>
          <th style="padding:6px 8px;background:#1E3A5F;color:#fff;text-align:left;border:1px solid #E5E7EB;font-size:11px">Pracownik</th>
          ${headerCells}
          <th style="padding:6px 4px;background:#1E3A5F;color:#fff;text-align:center;border:1px solid #E5E7EB;font-size:10px">Godz.</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <script>window.onload=()=>window.print()</script></body></html>`

    const win = window.open('', '_blank')
    win?.document.write(html); win?.document.close()
  }

  /* ── render ── */
  return (
    <div className="max-w-full space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['week', 'month'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === v ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {v === 'week' ? 'Tydzień' : 'Miesiąc'}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <button onClick={() => viewMode === 'week' ? navigateWeek(-1) : navigateMonth(-1)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 text-slate-600 font-bold">
            &#8249;
          </button>
          <div className="min-w-[180px] text-center">
            {viewMode === 'week' ? (
              <span className="text-sm font-semibold text-slate-800">
                {weekDays[0] && `${weekDays[0].dateFull} – ${weekDays[6]?.dateFull} ${MONTH_NAMES[weekDays[0].month]} ${viewYear}`}
              </span>
            ) : (
              <span className="text-sm font-semibold text-slate-800">{MONTH_NAMES[viewMonth]} {viewYear}</span>
            )}
          </div>
          <button onClick={() => viewMode === 'week' ? navigateWeek(1) : navigateMonth(1)} className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 text-slate-600 font-bold">
            &#8250;
          </button>
          <button onClick={() => { setWeekStart(getWeekStartMonday(today)); setViewMonth(todayDate.getMonth()); setViewYear(todayDate.getFullYear()) }}
            className="h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">Dziś</button>
        </div>

        {/* Stats + Post button */}
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">{totalAllHours.toFixed(1)}h</span>
            <span className="px-2 py-1 bg-slate-100 rounded text-slate-600">{shifts.length} zmian</span>
            {draftCount > 0 && <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded font-medium">{draftCount} roboczych</span>}
            {postedCount > 0 && <span className="px-2 py-1 bg-green-100 text-green-700 rounded font-medium">{postedCount} opublikowanych</span>}
          </div>
          {draftCount > 0 && (
            <Button size="sm" onClick={postSchedule} disabled={posting} className="h-8 bg-green-600 hover:bg-green-700 text-white gap-1.5">
              {posting ? 'Publikowanie...' : `Opublikuj grafik (${draftCount})`}
            </Button>
          )}
          {pendingSuggestions.length > 0 && (
            <button onClick={() => setTab('suggestions')} className="h-8 px-3 text-xs rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-medium">
              💡 {pendingSuggestions.length} sugestii
            </button>
          )}
          <button onClick={exportPDF} className="h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium">
            📄 PDF
          </button>
          <button onClick={() => setOpenShiftModal({ open: true, date: periodStart, time_start: '08:00', time_end: '16:00', position: '', publishNow: false })}
            className="h-8 px-3 text-xs rounded-lg border border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium">
            + Zmiana do wzięcia
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['schedule', 'suggestions', 'clockins'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'schedule' ? '📅 Grafik' : t === 'suggestions' ? `💡 Sugestie ${pendingSuggestions.length > 0 ? `(${pendingSuggestions.length})` : ''}` : `📸 Odbicia czasu (${clockIns.length})`}
          </button>
        ))}
      </div>

      {/* ── SUGGESTIONS TAB ── */}
      {tab === 'suggestions' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {allSuggestions.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">Brak oczekujących sugestii od pracowników</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Pracownik</th>
                  <th className="px-3 py-2.5 text-left">Data</th>
                  <th className="px-3 py-2.5 text-left">Typ</th>
                  <th className="px-3 py-2.5 text-left">Godziny</th>
                  <th className="px-3 py-2.5 text-left">Uwaga</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allSuggestions.map(sug => {
                  const ss = sugStyle(sug.suggestion_type)
                  const icon = sugIcon(sug.suggestion_type)
                  const isSpecific = !sug.suggestion_type || sug.suggestion_type === 'specific'
                  const empName =
                    sug.employees?.full_name ??
                    employees.find(e => e.id === sug.employee_id)?.full_name ??
                    employees.find(e => e.user_id === sug.user_id)?.full_name ??
                    '—'
                  return (
                  <tr key={sug.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{empName}</td>
                    <td className="px-3 py-3 text-slate-600">{sug.date}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${ss.badge}`}>
                        {icon} {sugTypeLabel(sug.suggestion_type)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {isSpecific ? `${fmt(sug.time_start)} – ${fmt(sug.time_end)}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-slate-500 text-xs max-w-[200px] truncate">{sug.note ?? '—'}</td>
                    <td className="px-4 py-3">
                      {sug.status === 'pending' && (
                        <div className="flex gap-1.5">
                          {isSpecific && (
                            <button onClick={() => acceptSuggestionAsShift(sug)} className="h-7 px-2.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 font-medium">
                              + Dodaj zmianę
                            </button>
                          )}
                          <button onClick={() => handleSuggestion(sug.id, 'rejected')} className="h-7 px-2 text-xs rounded border border-slate-200 text-slate-500 hover:text-red-500">
                            Odrzuć
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CLOCK-INS TAB ── */}
      {tab === 'clockins' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {clockIns.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm">
                  Brak odbić czasu pracy w tym okresie
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left">Pracownik</th>
                  <th className="px-3 py-2.5 text-left">Data</th>
                  <th className="px-3 py-2.5 text-left">Przyjście</th>
                  <th className="px-3 py-2.5 text-left">Wyjście</th>
                  <th className="px-3 py-2.5 text-left">Przepracowano</th>
                  <th className="px-3 py-2.5 text-left">Zdjęcia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clockIns.map(rec => {
                  const inTime = rec.clock_in_at ? new Date(rec.clock_in_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—'
                  const outTime = rec.clock_out_at ? new Date(rec.clock_out_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—'
                  const workedMins = rec.clock_in_at && rec.clock_out_at
                    ? Math.round((new Date(rec.clock_out_at).getTime() - new Date(rec.clock_in_at).getTime()) / 60000) : null
                  const workedStr = workedMins != null ? `${Math.floor(workedMins / 60)}h ${workedMins % 60}min` : '—'
                  const empName = employees.find(e => e.user_id === rec.user_id)?.full_name ?? '—'
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{empName}</td>
                      <td className="px-3 py-3 text-slate-600">{rec.work_date}</td>
                      <td className="px-3 py-3">
                        <span className={rec.clock_in_at ? 'text-green-700 font-medium' : 'text-slate-400'}>{inTime}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={rec.clock_out_at ? 'text-red-600 font-medium' : 'text-slate-400'}>{outTime}</span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">{workedStr}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          {rec.clock_in_photo_url && (
                            <a href={rec.clock_in_photo_url} target="_blank" rel="noreferrer" title="Zdjęcie przyjście">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={rec.clock_in_photo_url} alt="in" className="w-10 h-10 rounded object-cover border border-green-300 hover:opacity-80" />
                            </a>
                          )}
                          {rec.clock_out_photo_url && (
                            <a href={rec.clock_out_photo_url} target="_blank" rel="noreferrer" title="Zdjęcie wyjście">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={rec.clock_out_photo_url} alt="out" className="w-10 h-10 rounded object-cover border border-red-300 hover:opacity-80" />
                            </a>
                          )}
                          {!rec.clock_in_photo_url && !rec.clock_out_photo_url && (
                            <span className="text-slate-300 text-xs">brak</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── SCHEDULE GRID ── */}
      {tab === 'schedule' && (
        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          {loading && <div className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-b">Wczytywanie...</div>}
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 w-[160px] border-r border-slate-200 sticky left-0 bg-slate-50 z-10">
                    Pracownik
                  </th>
                  {displayDays.map(d => {
                    const isHoliday = holidays.has(d.iso)
                    const holName = getHolidayName(d.iso, holidays)
                    return (
                      <th key={d.iso}
                        className={`px-1.5 py-2 text-center border-r border-slate-200 ${viewMode === 'month' ? 'min-w-[44px]' : 'min-w-[130px]'} ${d.isToday ? 'bg-blue-50' : isHoliday ? 'bg-amber-50' : d.isWeekend ? 'bg-slate-100/60' : ''}`}>
                        <div className={`text-[9px] font-bold uppercase ${d.isToday ? 'text-blue-600' : isHoliday ? 'text-amber-600' : 'text-slate-400'}`}>{d.label}</div>
                        <div className={`font-semibold ${viewMode === 'month' ? 'text-[11px]' : 'text-sm'} mt-0.5 ${d.isToday ? 'text-blue-700' : isHoliday ? 'text-amber-700' : 'text-slate-700'}`}>
                          {'day' in d ? d.day : d.dateFull}
                        </div>
                        {d.isToday && <div className="w-1 h-1 bg-blue-500 rounded-full mx-auto mt-0.5" />}
                        {isHoliday && <div className="text-[8px] text-amber-600 leading-tight mt-0.5 truncate max-w-[60px] mx-auto" title={holName ?? ''}>{holName}</div>}
                      </th>
                    )
                  })}
                  <th className="px-2 py-3 text-center text-xs font-semibold uppercase text-slate-400 w-14 sticky right-0 bg-slate-50 z-10">Godz.</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => (
                  <tr key={emp.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-blue-50/10`}>
                    {/* Employee name */}
                    <td className="px-3 py-2 border-r border-b border-slate-200 align-middle sticky left-0 bg-inherit z-10">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                          {emp.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-800 truncate max-w-[100px]">{emp.full_name}</p>
                          {emp.user_id && <p className="text-[9px] text-green-600">● aktywny</p>}
                        </div>
                      </div>
                    </td>

                    {/* Day cells */}
                    {displayDays.map(d => {
                      const dayShifts = getShifts(emp, d.iso)
                      const isHoliday = holidays.has(d.iso)
                      return (
                        <td key={d.iso}
                          className={`border-r border-b border-slate-200 align-top ${d.isToday ? 'bg-blue-50/20' : isHoliday ? 'bg-amber-50/40' : d.isWeekend ? 'bg-slate-50/40' : ''} ${viewMode === 'month' ? 'p-0.5' : 'px-1.5 py-1.5'}`}>
                          <div className={`space-y-0.5 ${viewMode === 'month' ? 'min-h-[32px]' : 'min-h-[52px]'}`}>
                            {dayShifts.map(shift => (
                              <button key={shift.id} onClick={() => openEdit(shift)}
                                className={`group/s w-full text-left rounded border cursor-pointer hover:opacity-80 active:scale-95 transition-all font-medium relative ${posColor(shift.position)} ${viewMode === 'month' ? 'px-0.5 py-0.5 text-[9px]' : 'px-1.5 py-1 text-xs'} ${!shift.is_posted ? 'opacity-70 border-dashed' : ''}`}
                                style={posStyle(shift.position)}>
                                {viewMode === 'month' ? (
                                  <div className="tabular-nums leading-tight">{fmt(shift.time_start).slice(0, 5)}</div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between">
                                      <span className="tabular-nums">{fmt(shift.time_start)}–{fmt(shift.time_end)}</span>
                                      {!shift.is_posted && <span className="text-[8px] opacity-50">szkic</span>}
                                      {shift.is_posted && shift.accepted_by && <span className="text-green-600 text-[9px] font-bold">&#10003;</span>}
                                    </div>
                                    {shift.position && <div className="opacity-70 truncate text-[9px]">{POSITION_MAP[shift.position]?.label ?? shift.position}</div>}
                                    <div className="opacity-50 text-[9px] flex items-center gap-1">
                                      {calcHours(fmt(shift.time_start), fmt(shift.time_end)).toFixed(1)}h
                                      {fmt(shift.time_end) < fmt(shift.time_start) && <span title="Zmiana nocna (do nast. dnia)">🌙</span>}
                                    </div>
                                  </>
                                )}
                              </button>
                            ))}
                            {getPendingSuggestions(emp, d.iso).map(sug => {
                              const ss = sugStyle(sug.suggestion_type)
                              const icon = sugIcon(sug.suggestion_type)
                              const isSpecific = !sug.suggestion_type || sug.suggestion_type === 'specific'
                              return (
                                <button key={`sg-${sug.id}`} onClick={() => setTab('suggestions')}
                                  title={`${sugTypeLabel(sug.suggestion_type)}: ${isSpecific ? `${fmt(sug.time_start)}–${fmt(sug.time_end)}` : ''}${sug.note ? '\n' + sug.note : ''}`}
                                  className={`w-full text-left rounded border-dashed cursor-pointer transition-all font-medium ${ss.cell} ${viewMode === 'month' ? 'px-0.5 py-0.5 text-[9px]' : 'px-1.5 py-1 text-xs'}`}>
                                  {viewMode === 'month' ? icon : (
                                    <>
                                      <div className="flex items-center gap-0.5">
                                        <span>{icon}</span>
                                        {isSpecific && <span className="tabular-nums">{fmt(sug.time_start)}–{fmt(sug.time_end)}</span>}
                                      </div>
                                      <div className="opacity-70 text-[9px]">{sugTypeLabel(sug.suggestion_type)}</div>
                                    </>
                                  )}
                                </button>
                              )
                            })}
                            <button onClick={() => openAdd(emp, d.iso)}
                              className={`w-full rounded border-dashed border-slate-200 text-slate-300 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-50 transition-all flex items-center justify-center ${viewMode === 'month' ? 'h-4 border text-[10px]' : 'h-6 border text-sm'}`}>
                              +
                            </button>
                          </div>
                        </td>
                      )
                    })}

                    {/* Total hours */}
                    <td className="px-2 py-2 border-b border-slate-200 text-center sticky right-0 bg-inherit z-10">
                      <span className="text-xs font-bold text-slate-700">{totalPeriodHours(emp).toFixed(1)}h</span>
                    </td>
                  </tr>
                ))}
                {/* Open shifts row */}
                {(() => {
                  const openShifts = shifts.filter(s => s.is_open_shift)
                  if (openShifts.length === 0) return null
                  return (
                    <tr className="bg-purple-50/60 border-t-2 border-purple-200">
                      <td className="px-3 py-2 border-r border-b border-slate-200 sticky left-0 bg-purple-50 z-10">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-700 shrink-0">?</div>
                          <div>
                            <p className="text-xs font-semibold text-purple-800">Zmiany do wzięcia</p>
                            <p className="text-[9px] text-purple-500">Dostępne dla pracowników</p>
                          </div>
                        </div>
                      </td>
                      {displayDays.map(d => {
                        const dayOpen = openShifts.filter(s => s.date === d.iso)
                        return (
                          <td key={d.iso} className={`border-r border-b border-slate-200 align-top ${viewMode === 'month' ? 'p-0.5' : 'px-1.5 py-1.5'}`}>
                            <div className={`space-y-0.5 ${viewMode === 'month' ? 'min-h-[32px]' : 'min-h-[52px]'}`}>
                              {dayOpen.map(shift => (
                                <button key={shift.id} onClick={() => openEdit(shift)}
                                  className={`w-full text-left rounded border cursor-pointer hover:opacity-80 transition-all font-medium border-dashed border-purple-400 bg-purple-50 text-purple-700 ${viewMode === 'month' ? 'px-0.5 py-0.5 text-[9px]' : 'px-1.5 py-1 text-xs'} ${!shift.is_posted ? 'opacity-60' : ''}`}
                                  style={posStyle(shift.position)}>
                                  {viewMode === 'month' ? (
                                    <div className="tabular-nums leading-tight">{fmt(shift.time_start)}</div>
                                  ) : (
                                    <>
                                      <div className="tabular-nums">{fmt(shift.time_start)}–{fmt(shift.time_end)}</div>
                                      {shift.position && <div className="opacity-70 text-[9px]">{POSITION_MAP[shift.position]?.label ?? shift.position}</div>}
                                      <div className="text-[9px] opacity-60">{!shift.is_posted ? 'szkic' : 'wolna'}</div>
                                    </>
                                  )}
                                </button>
                              ))}
                              <button onClick={() => setOpenShiftModal({ open: true, date: d.iso, time_start: '08:00', time_end: '16:00', position: '', publishNow: false })}
                                className={`w-full rounded border-dashed border-purple-200 text-purple-300 hover:border-purple-400 hover:text-purple-500 hover:bg-purple-50 transition-all flex items-center justify-center ${viewMode === 'month' ? 'h-4 border text-[10px]' : 'h-6 border text-sm'}`}>
                                +
                              </button>
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-2 py-2 border-b border-slate-200 text-center sticky right-0 bg-purple-50 z-10">
                        <span className="text-xs font-bold text-purple-600">{openShifts.length}</span>
                      </td>
                    </tr>
                  )
                })()}
              </tbody>
            </table>
          </div>

          {/* Legend bar */}
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {allPositions.map(p => {
                  const hex = positionColors[p.value] ?? positionColors[p.value.toLowerCase()]
                  return (
                    <span key={p.value}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${!hex ? p.color : ''}`}
                      style={hex ? { backgroundColor: hex + '28', color: hex, borderColor: hex + '90' } : {}}>
                      {p.label}
                    </span>
                  )
                })}
              </div>
              <button onClick={() => setShowPosPanel(v => !v)}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 underline ml-1">
                {showPosPanel ? 'Zamknij' : '⚙ Zarządzaj stanowiskami'}
              </button>
              <div className="ml-auto flex gap-3 text-[10px] text-slate-400">
                <span>-- Szkic</span>
                <span>&#9644; Opublikowany</span>
                <span className="text-green-600">&#10003; Zaakceptowany</span>
                <span className="text-red-500">🚫 Niedostępny</span>
              </div>
            </div>

            {/* Position management panel */}
            {showPosPanel && (
              <div className="mt-3 bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Stanowiska i kolory</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Zdefiniuj stanowiska i przypisz im kolory — będą widoczne w grafiku</p>
                </div>

                {/* Built-in positions */}
                <div className="p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Domyślne</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {POSITIONS.map(p => {
                      const hex = positionColors[p.value] ?? '#6366F1'
                      return (
                        <div key={p.value} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                          <input type="color" value={hex}
                            onChange={e => savePositionColor(p.value, e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0"
                            title="Zmień kolor" />
                          <span className="text-[12px] font-medium text-slate-700 truncate">{p.label}</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Custom positions */}
                  {customPositions.length > 0 && (
                    <>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-2">Własne</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {customPositions.map(p => {
                          const hex = positionColors[p.value] ?? '#6366F1'
                          return (
                            <div key={p.value} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                              <input type="color" value={hex}
                                onChange={e => savePositionColor(p.value, e.target.value)}
                                className="w-6 h-6 rounded cursor-pointer border-0 p-0 shrink-0"
                                title="Zmień kolor" />
                              <span className="text-[12px] font-medium text-slate-700 truncate flex-1">{p.label}</span>
                              <button onClick={() => deleteCustomPosition(p.value)}
                                className="text-slate-300 hover:text-red-400 transition-colors text-[14px] leading-none shrink-0">×</button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  {/* Add new */}
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Dodaj własne stanowisko</p>
                    <div className="flex items-center gap-2">
                      <input type="color" value={newPosColor}
                        onChange={e => setNewPosColor(e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer border border-slate-200 p-0.5 shrink-0"
                        title="Wybierz kolor" />
                      <input
                        type="text"
                        placeholder="Nazwa stanowiska…"
                        value={newPosName}
                        onChange={e => setNewPosName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveNewPosition() }}
                        className="flex-1 h-8 px-3 rounded-lg border border-slate-200 text-[13px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <button onClick={saveNewPosition} disabled={savingPos || !newPosName.trim()}
                        className="h-8 px-4 rounded-lg bg-blue-600 text-white text-[12px] font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0">
                        {savingPos ? '…' : 'Dodaj'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── EDIT/ADD MODAL ── */}
      <Dialog open={modal.open} onOpenChange={o => setModal(m => ({ ...m, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{modal.mode === 'add' ? 'Nowa zmiana' : 'Edytuj zmianę'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1.5 block">Pracownik</Label>
              <p className="text-sm font-medium text-slate-800">{modal.shift.employee_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">Data: {modal.shift.date}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Godzina rozpoczęcia</Label>
                <Input type="time" value={modal.shift.time_start ?? ''} onChange={e => setModal(m => ({ ...m, shift: { ...m.shift, time_start: e.target.value } }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Godzina zakończenia</Label>
                <Input type="time" value={modal.shift.time_end ?? ''} onChange={e => setModal(m => ({ ...m, shift: { ...m.shift, time_end: e.target.value } }))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Przerwa (min) — wliczona w czas</Label>
                <Input type="number" min="0" max="120" step="5" value={modal.shift.break_minutes ?? 0} onChange={e => setModal(m => ({ ...m, shift: { ...m.shift, break_minutes: Number(e.target.value) } }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Stanowisko</Label>
                <Select
                  value={modal.shift.position || 'none'}
                  onValueChange={v => setModal(m => ({ ...m, shift: { ...m.shift, position: v === 'none' ? null : v } }))}
                >
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wybierz…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— brak —</SelectItem>
                    {allPositions.map(p => {
                      const hex = positionColors[p.value] ?? positionColors[p.value.toLowerCase()]
                      return (
                        <SelectItem key={p.value} value={p.value}>
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                              style={hex
                                ? { backgroundColor: hex, opacity: 0.85 }
                                : { backgroundColor: '#94a3b8' }} />
                            {p.label}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400 mt-1">Brakuje stanowiska? Dodaj je przez <button onClick={() => { setShowPosPanel(true); setModal(m => ({...m, open: false})) }} className="underline text-blue-500">Zarządzaj stanowiskami</button>.</p>
              </div>
            </div>
            {modalHours > 0 && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-800 font-medium">
                Czas pracy: <strong>{modalHours.toFixed(2)} h</strong>
                <span className="text-blue-500 text-xs ml-2">(przerwa wliczona)</span>
              </div>
            )}
            {modal.mode === 'add' && (
              <>
                <label className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={modal.shift.publishNow ?? false}
                    onChange={e => setModal(m => ({ ...m, shift: { ...m.shift, publishNow: e.target.checked } }))}
                    className="w-4 h-4 rounded accent-green-600" />
                  <span className="text-xs text-amber-800">Opublikuj od razu — pracownicy zobaczą zmianę natychmiast w aplikacji</span>
                </label>
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                  <span className="text-xs text-blue-800 font-medium shrink-0">Powtarzaj co tydzień:</span>
                  <select
                    value={modal.shift.repeatWeeks ?? 0}
                    onChange={e => setModal(m => ({ ...m, shift: { ...m.shift, repeatWeeks: Number(e.target.value) } }))}
                    className="h-7 px-2 rounded border border-blue-200 bg-white text-xs text-blue-900 focus:outline-none"
                  >
                    <option value={0}>Nie powtarzaj</option>
                    <option value={1}>1 raz (2 tygodnie)</option>
                    <option value={2}>2 razy (3 tygodnie)</option>
                    <option value={3}>3 razy (4 tygodnie)</option>
                    <option value={7}>7 razy (8 tygodni)</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            {modal.mode === 'edit' && (
              <Button variant="destructive" size="sm" onClick={() => deleteShift(modal.shift.id!)}>
                Usuń
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setModal(m => ({ ...m, open: false }))}>Anuluj</Button>
            <Button size="sm" onClick={saveShift}>{modal.mode === 'add' ? 'Dodaj zmianę' : 'Zapisz zmiany'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── OPEN SHIFT MODAL ── */}
      <Dialog open={openShiftModal.open} onOpenChange={o => setOpenShiftModal(m => ({ ...m, open: o }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Zmiana do wzięcia</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 -mt-1">Pracownicy zobaczą tę zmianę jako dostępną do zarezerwowania.</p>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs mb-1.5 block">Data</Label>
              <Input type="date" value={openShiftModal.date} onChange={e => setOpenShiftModal(m => ({ ...m, date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Od</Label>
                <Input type="time" value={openShiftModal.time_start} onChange={e => setOpenShiftModal(m => ({ ...m, time_start: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Do</Label>
                <Input type="time" value={openShiftModal.time_end} onChange={e => setOpenShiftModal(m => ({ ...m, time_end: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Stanowisko</Label>
              <Select value={openShiftModal.position || 'none'} onValueChange={v => setOpenShiftModal(m => ({ ...m, position: v === 'none' ? '' : v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Wybierz…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— dowolne —</SelectItem>
                  {POSITIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  {customPositions.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {openShiftModal.time_start && openShiftModal.time_end && (
              <div className="bg-purple-50 rounded-lg px-3 py-2 text-sm text-purple-800 font-medium">
                Czas zmiany: <strong>{calcHours(openShiftModal.time_start, openShiftModal.time_end).toFixed(1)} h</strong>
              </div>
            )}
            <label className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={openShiftModal.publishNow}
                onChange={e => setOpenShiftModal(m => ({ ...m, publishNow: e.target.checked }))}
                className="w-4 h-4 rounded accent-green-600" />
              <span className="text-xs text-amber-800">Opublikuj od razu — pracownicy zobaczą zmianę natychmiast</span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenShiftModal(m => ({ ...m, open: false }))}>Anuluj</Button>
            <Button size="sm" onClick={saveOpenShift} disabled={savingOpenShift || !openShiftModal.date}
              className="bg-purple-600 hover:bg-purple-700 text-white">
              {savingOpenShift ? 'Zapisywanie…' : 'Dodaj zmianę'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
