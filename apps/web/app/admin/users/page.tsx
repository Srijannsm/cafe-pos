"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { IconUsers, IconEdit, IconCheck, IconX, IconKey } from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type Role = "admin" | "cashier" | "waiter";

type StaffRow = {
  id: number;
  name: string;
  role: Role;
  isActive: boolean;
};

const ROLES: Role[] = ["admin", "cashier", "waiter"];

const selectClass =
  "min-h-12 rounded-sm border border-border-subtle bg-surface-sunken px-3 text-sm text-ink-primary outline-none focus:border-focus-ring focus:ring-2 focus:ring-focus-ring/30";

function roleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UsersManagementPage() {
  const { showToast, toastHost } = useToast();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffSearch, setStaffSearch] = useState("");

  const [drafts, setDrafts] = useState<Record<number, { name: string; role: Role }>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [pinDraft, setPinDraft] = useState("");

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("waiter");
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshAll = useCallback(async () => {
    const res = await apiFetchJson<StaffRow[]>("/users");
    setStaff(res);
    setDrafts(Object.fromEntries(res.map((u) => [u.id, { name: u.name, role: u.role }])));
  }, []);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetchJson("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, role: newRole, pin: newPin }),
      });
      setNewName("");
      setNewRole("waiter");
      setNewPin("");
      await refreshAll();
      showToast(`"${newName}" added`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not add that staff member", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStaff(user: StaffRow, data: { name: string; role: Role }) {
    try {
      await apiFetchJson(`/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refreshAll();
      showToast(`"${data.name}" updated`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not update "${user.name}"`, "error");
    }
  }

  async function handleToggleActive(user: StaffRow) {
    try {
      await apiFetchJson(`/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await refreshAll();
      showToast(user.isActive ? `"${user.name}" deactivated` : `"${user.name}" reactivated`);
    } catch {
      showToast(`Could not update "${user.name}"`, "error");
    }
  }

  async function handleResetPin(user: StaffRow) {
    if (pinDraft.length !== 4) {
      showToast("PIN must be 4 digits", "error");
      return;
    }
    try {
      await apiFetchJson(`/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinDraft }),
      });
      setResettingId(null);
      setPinDraft("");
      showToast(`PIN reset for "${user.name}"`);
    } catch {
      showToast(`Could not reset PIN for "${user.name}"`, "error");
    }
  }

  const filteredStaff = staff.filter((u) => u.name.toLowerCase().includes(staffSearch.toLowerCase()));

  return (
    <div className="space-y-8">
      {toastHost}
      <div>
        <h1 className="display-md text-ink-primary">Staff &amp; PINs</h1>
        <p className="body-md mt-1 text-ink-secondary">
          Add staff, change roles, or reset a PIN. Deactivating removes someone from the login screen without
          deleting their order history.
        </p>
      </div>

      <SectionCard icon={<IconUsers />} title="Add staff" description="They'll appear on the PIN login screen right away.">
        <form onSubmit={handleAddStaff} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">Name</label>
            <Input className="w-44" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">Role</label>
            <select className={selectClass} value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">4-digit PIN</label>
            <Input
              className="w-28"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              pattern="[0-9]{4}"
              required
            />
          </div>
          <Button type="submit" disabled={saving || newPin.length !== 4}>
            Add staff
          </Button>
        </form>
      </SectionCard>

      <SectionCard icon={<IconUsers />} title="Existing staff" description="Search, edit roles, or reset a PIN.">
        <div className="mb-5 sm:max-w-xs">
          <Input pill placeholder="Search staff…" value={staffSearch} onChange={(e) => setStaffSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-surface-sunken" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map((user) => {
                  const isEditing = editingId === user.id;
                  const isResetting = resettingId === user.id;
                  const draft = drafts[user.id] ?? { name: user.name, role: user.role };

                  return (
                    <tr key={user.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-4 pr-4">
                        {isEditing ? (
                          <Input
                            autoFocus
                            className="w-40"
                            value={draft.name}
                            onChange={(e) => setDrafts((cur) => ({ ...cur, [user.id]: { ...draft, name: e.target.value } }))}
                          />
                        ) : (
                          <span className="body-md font-medium text-ink-primary">{user.name}</span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        {isEditing ? (
                          <select
                            className={selectClass}
                            value={draft.role}
                            onChange={(e) =>
                              setDrafts((cur) => ({ ...cur, [user.id]: { ...draft, role: e.target.value as Role } }))
                            }
                          >
                            {ROLES.map((role) => (
                              <option key={role} value={role}>
                                {roleLabel(role)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="body-md text-ink-secondary">{roleLabel(user.role)}</span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(user)}
                          className={`label-sm rounded-pill px-3 py-1 font-semibold transition ${
                            user.isActive
                              ? "bg-status-success-tint text-status-success-ink hover:brightness-95"
                              : "bg-surface-sunken text-ink-faint hover:brightness-95"
                          }`}
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="py-4 pr-0">
                        {isResetting ? (
                          <div className="flex justify-end gap-1.5">
                            <Input
                              autoFocus
                              className="w-24"
                              placeholder="New PIN"
                              value={pinDraft}
                              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                              inputMode="numeric"
                              pattern="[0-9]{4}"
                            />
                            <button
                              type="button"
                              aria-label={`Save new PIN for ${user.name}`}
                              onClick={() => handleResetPin(user)}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-status-success-ink transition hover:bg-status-success-tint"
                            >
                              <IconCheck className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel PIN reset"
                              onClick={() => {
                                setResettingId(null);
                                setPinDraft("");
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint transition hover:bg-surface-sunken"
                            >
                              <IconX className="h-4 w-4" />
                            </button>
                          </div>
                        ) : isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              aria-label={`Save ${user.name}`}
                              onClick={() => {
                                handleUpdateStaff(user, draft);
                                setEditingId(null);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-status-success-ink transition hover:bg-status-success-tint"
                            >
                              <IconCheck className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel edit"
                              onClick={() => {
                                setDrafts((cur) => ({ ...cur, [user.id]: { name: user.name, role: user.role } }));
                                setEditingId(null);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint transition hover:bg-surface-sunken"
                            >
                              <IconX className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              aria-label={`Reset PIN for ${user.name}`}
                              onClick={() => {
                                setResettingId(user.id);
                                setPinDraft("");
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken"
                            >
                              <IconKey className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit ${user.name}`}
                              onClick={() => setEditingId(user.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken"
                            >
                              <IconEdit className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={4} className="body-md py-8 text-center text-ink-faint">
                      {staff.length === 0 ? "No staff yet." : "No staff match your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
