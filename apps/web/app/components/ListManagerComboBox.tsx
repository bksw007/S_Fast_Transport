"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createListOption,
  canManageOrganizationLists,
  deleteListOption,
  subscribeListOptions,
  updateListOption,
  type ListOption,
  type ListOptionField,
  type UserProfile
} from "@/lib/transport-repository";

type DropdownPosition = { top: number; left: number; width: number };

export function ListManagerComboBox({
  field,
  value,
  placeholder,
  organizationId,
  actor,
  onChange,
  required = false
}: {
  field: ListOptionField;
  value: string;
  placeholder: string;
  organizationId: string;
  actor: UserProfile;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `list-manager-${useId().replaceAll(":", "")}`;
  const [items, setItems] = useState<ListOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [editingId, setEditingId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [mutating, setMutating] = useState("");
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: 280 });
  const [dark, setDark] = useState(false);
  const canManage = canManageOrganizationLists(actor, organizationId);

  const query = value.trim().toLocaleLowerCase("th-TH");
  const shownItems = useMemo(
    () => query
      ? items.filter((item) => item.value.toLocaleLowerCase("th-TH").includes(query))
      : items,
    [items, query]
  );
  const exactMatch = items.some((item) => item.value.trim().toLocaleLowerCase("th-TH") === query);
  const safeActiveIndex = Math.min(activeIndex, shownItems.length - 1);

  useEffect(() => {
    if (!open) return;
    return subscribeListOptions(
      organizationId,
      field,
      (nextItems) => {
        setItems(nextItems);
        setLoading(false);
        setError("");
      },
      (message) => {
        setError(`โหลดรายการไม่สำเร็จ: ${message}`);
        setLoading(false);
      }
    );
  }, [field, open, organizationId]);

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const preferredHeight = Math.min(320, window.innerHeight * 0.55);
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - margin * 2);
      const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
      const opensAbove = window.innerHeight - rect.bottom < preferredHeight && rect.top > preferredHeight;
      setPosition({
        top: opensAbove ? Math.max(margin, rect.top - preferredHeight - 6) : rect.bottom + 6,
        left,
        width
      });
      setDark(wrapperRef.current?.closest("[data-theme]")?.getAttribute("data-theme") === "dark");
    }

    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !dropdownRef.current?.contains(target)) {
        setOpen(false);
        setEditingId("");
      }
    }

    reposition();
    document.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function selectItem(item: ListOption) {
    onChange(item.value);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  async function runMutation(key: string, action: () => Promise<void>) {
    if (mutating) return;
    setMutating(key);
    setError("");
    try {
      await action();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "บันทึกรายการไม่สำเร็จ");
    } finally {
      setMutating("");
    }
  }

  async function addCurrentValue() {
    const nextValue = value.trim();
    if (!nextValue || exactMatch) return;
    await runMutation("add", () => createListOption(organizationId, field, nextValue, actor));
  }

  async function saveEdit(item: ListOption) {
    const nextValue = editValue.trim();
    if (!nextValue) {
      setError("กรุณากรอกรายการ");
      return;
    }
    await runMutation(item.id, async () => {
      await updateListOption(organizationId, item, nextValue, actor);
      if (value === item.value) onChange(nextValue);
      setEditingId("");
    });
  }

  async function removeItem(item: ListOption) {
    if (!window.confirm(`ลบรายการ “${item.value}” ใช่หรือไม่?`)) return;
    await runMutation(item.id, () => deleteListOption(organizationId, item, actor));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setEditingId("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, shownItems.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(Math.min(current, shownItems.length - 1) - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && safeActiveIndex >= 0 && shownItems[safeActiveIndex]) {
      event.preventDefault();
      selectItem(shownItems[safeActiveIndex]);
    }
  }

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      id={listboxId}
      className={`list-manager-dropdown ${dark ? "dark" : ""}`}
      role="listbox"
      style={position}
    >
      <div className="list-manager-heading">
        <span>รายการที่บันทึกไว้</span>
        <small>{canManage ? `${items.length} รายการ` : `${items.length} รายการ · เลือกได้เท่านั้น`}</small>
      </div>

      {loading && <div className="list-manager-message"><LoaderCircle className="spin" size={17} /> กำลังโหลด…</div>}
      {!loading && !shownItems.length && (
        <div className="list-manager-message">{query ? "ไม่พบรายการที่ตรงกัน" : "ยังไม่มีรายการที่บันทึกไว้"}</div>
      )}

      {!loading && shownItems.map((item, index) => (
        <div
          key={item.id}
          className={`list-manager-row ${safeActiveIndex === index ? "active" : ""} ${editingId === item.id ? "editing" : ""}`}
          role="option"
          aria-selected={safeActiveIndex === index}
        >
          {editingId === item.id ? (
            <>
              <input
                className="list-manager-edit-input"
                value={editValue}
                maxLength={160}
                aria-label="แก้ไขรายการ"
                autoFocus
                onChange={(event) => setEditValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); void saveEdit(item); }
                  if (event.key === "Escape") setEditingId("");
                }}
              />
              <button type="button" className="list-manager-icon save" aria-label="บันทึกการแก้ไข" disabled={mutating === item.id} onClick={() => void saveEdit(item)}>
                {mutating === item.id ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
              </button>
              <button type="button" className="list-manager-icon" aria-label="ยกเลิกการแก้ไข" onClick={() => setEditingId("")}><X size={16} /></button>
            </>
          ) : (
            <>
              <button type="button" className="list-manager-value" onClick={() => selectItem(item)}>{item.value}</button>
              {canManage && <div className="list-manager-actions">
                <button
                  type="button"
                  className="list-manager-icon edit"
                  aria-label={`แก้ไข ${item.value}`}
                  onClick={() => { setEditingId(item.id); setEditValue(item.value); }}
                ><Pencil size={15} /></button>
                <button
                  type="button"
                  className="list-manager-icon delete"
                  aria-label={`ลบ ${item.value}`}
                  disabled={mutating === item.id}
                  onClick={() => void removeItem(item)}
                >{mutating === item.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button>
              </div>}
            </>
          )}
        </div>
      ))}

      {error && <div className="list-manager-error">{error}</div>}
      {canManage && query && !exactMatch && (
        <button type="button" className="list-manager-add" disabled={mutating === "add"} onClick={() => void addCurrentValue()}>
          {mutating === "add" ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
          <span>เพิ่ม “{value.trim()}” ลงในรายการ</span>
        </button>
      )}
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className="list-manager-combobox">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        required={required}
        maxLength={160}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
      />
      <button type="button" className="list-manager-toggle" aria-label="เปิดรายการ" tabIndex={-1} onClick={() => { setOpen((current) => !current); inputRef.current?.focus(); }}>
        <ChevronDown size={16} />
      </button>
      {typeof document !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
