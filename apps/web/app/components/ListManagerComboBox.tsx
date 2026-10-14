"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createListOption,
  canManageOrganizationLists,
  deleteListOption,
  subscribeCustomerCargoTypes,
  subscribeListOptions,
  updateListOption,
  type ListOption,
  type ListOptionField,
  type UserProfile
} from "@/lib/transport-repository";

type DropdownPosition = { top: number; left: number; width: number; maxHeight: number };

export function ListManagerComboBox({
  field,
  value,
  placeholder,
  organizationId,
  customerId,
  actor,
  onChange,
  required = false
}: {
  field: ListOptionField;
  value: string;
  placeholder: string;
  organizationId: string;
  customerId?: string;
  actor: UserProfile;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const listboxId = `list-manager-${useId().replaceAll(":", "")}`;
  const [items, setItems] = useState<ListOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [editingId, setEditingId] = useState("");
  const [editValue, setEditValue] = useState("");
  const [mutating, setMutating] = useState("");
  const [position, setPosition] = useState<DropdownPosition>({ top: 0, left: 0, width: 280, maxHeight: 320 });
  const [mobile, setMobile] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [dark, setDark] = useState(false);
  const canManage = !customerId && canManageOrganizationLists(actor, organizationId);

  const valueQuery = value.trim().toLocaleLowerCase("th-TH");
  const query = searching ? valueQuery : "";
  const shownItems = useMemo(
    () => query
      ? items.filter((item) => item.value.toLocaleLowerCase("th-TH").includes(query))
      : items,
    [items, query]
  );
  const exactMatch = items.some((item) => item.value.trim().toLocaleLowerCase("th-TH") === valueQuery);
  const safeActiveIndex = Math.min(activeIndex, shownItems.length - 1);

  useEffect(() => {
    if (!open) return;
    const subscribe = customerId && field === "cargo_type" ? subscribeCustomerCargoTypes : null;
    if (subscribe) return subscribe(customerId!, (nextItems) => { setItems(nextItems); setLoading(false); setError(""); }, (message) => { setError(`โหลดรายการไม่สำเร็จ: ${message}`); setLoading(false); });
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
  }, [customerId, field, open, organizationId]);

  useEffect(() => {
    if (!open) return;

    function reposition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop ?? 0;
      const visibleLeft = viewport?.offsetLeft ?? 0;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const visibleWidth = viewport?.width ?? window.innerWidth;
      const margin = 12;
      const isMobile = window.matchMedia("(max-width: 700px)").matches;
      setMobile(isMobile);
      if (isMobile) {
        // Keep the list in one predictable place inside the visible iPhone viewport,
        // including while the software keyboard changes its height.
        setPosition({
          top: visibleTop + margin,
          left: visibleLeft + margin,
          width: Math.max(0, visibleWidth - margin * 2),
          maxHeight: Math.max(80, visibleHeight - margin * 2)
        });
      } else {
        const preferredHeight = Math.min(320, visibleHeight * 0.55);
        const width = Math.min(Math.max(rect.width, 280), visibleWidth - margin * 2);
        const left = Math.min(Math.max(rect.left, visibleLeft + margin), visibleLeft + visibleWidth - width - margin);
        const opensAbove = visibleTop + visibleHeight - rect.bottom < preferredHeight && rect.top - visibleTop > preferredHeight;
        setPosition({
          top: opensAbove ? Math.max(visibleTop + margin, rect.top - preferredHeight - 6) : rect.bottom + 6,
          left,
          width,
          maxHeight: Math.max(80, Math.min(preferredHeight, opensAbove ? rect.top - visibleTop - margin : visibleTop + visibleHeight - rect.bottom - margin))
        });
      }
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
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (open && mobile) mobileSearchRef.current?.focus();
  }, [open, mobile]);

  function selectItem(item: ListOption) {
    onChange(item.value);
    setOpen(false);
    setSearching(false);
    setActiveIndex(-1);
  }

  function showAllItems() {
    setPortalRoot(wrapperRef.current?.closest<HTMLDialogElement>("dialog[open]") ?? document.body);
    setSearching(false);
    setActiveIndex(-1);
    setOpen(true);
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
    await runMutation("add", async () => {
      await createListOption(organizationId, field, nextValue, actor);
      setOpen(false);
      setActiveIndex(-1);
    });
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
      if (!open) showAllItems();
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
      className={`list-manager-dropdown ${dark ? "dark" : ""} ${mobile ? "mobile" : ""}`}
      role="listbox"
      style={position}
    >
      <div className="list-manager-heading">
        <span>รายการที่บันทึกไว้</span>
        <small>{canManage ? `${items.length} รายการ` : customerId ? `${items.length} รายการ · พิมพ์ใหม่ได้` : `${items.length} รายการ · เลือกได้เท่านั้น`}</small>
        {mobile && <button type="button" className="list-manager-close" aria-label="ปิดรายการ" onClick={() => setOpen(false)}><X size={20} /></button>}
      </div>

      {mobile && <input
        ref={mobileSearchRef}
        className="list-manager-mobile-search"
        aria-label={`ค้นหา${placeholder}`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => { onChange(event.target.value); setSearching(true); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
      />}

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
      {canManage && valueQuery && !exactMatch && (
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
        onFocus={showAllItems}
        onClick={showAllItems}
        onChange={(event) => { onChange(event.target.value); setSearching(true); setOpen(true); setActiveIndex(-1); }}
        onKeyDown={handleKeyDown}
      />
      <button type="button" className="list-manager-toggle" aria-label={open ? "ปิดรายการ" : "เปิดรายการ"} tabIndex={-1} onClick={() => { if (open) { setOpen(false); return; } showAllItems(); inputRef.current?.focus(); }}>
        <ChevronDown size={16} />
      </button>
      {portalRoot && dropdown && createPortal(dropdown, portalRoot)}
    </div>
  );
}
