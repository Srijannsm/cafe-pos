"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { IconUsers, IconEdit, IconCheck, IconX, IconKey } from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Button } from "../../../components/ui/Button";
import { DataTable } from "../../../components/ui/DataTable";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";

type Role = "admin" | "cashier" | "waiter";

type StaffRow = {
  id: number;
  name: string;
  role: Role;
  isActive: boolean;
};

const ROLES: Role[] = ["admin", "cashier", "waiter"];

const AVATAR_TONES = [
  "bg-avatar-1 text-avatar-1-ink",
  "bg-avatar-2 text-avatar-2-ink",
  "bg-avatar-3 text-avatar-3-ink",
  "bg-avatar-4 text-avatar-4-ink",
  "bg-avatar-5 text-avatar-5-ink",
];

function toneFor(id: number) {
  return AVATAR_TONES[id % AVATAR_TONES.length];
}

function roleLabel(role: Role) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UsersManagementPage() {
  const { showToast, toastHost } = useToast();

  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");

  const [drafts, setDrafts] = useState<Record<number, { name: string; role: Role }>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [pinDraft, setPinDraft] = useState("");

  const [deactivatingUser, setDeactivatingUser] = useState<StaffRow | null>(null);

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
    refreshAll()
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
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
      <PageHeader
        title="Staff & PINs"
        description="Add staff, change roles, or reset a PIN. Deactivating removes someone from the login screen without deleting their order history."
      />

      <SectionCard icon={<IconUsers />} title="Add staff" description="They'll appear on the PIN login screen right away.">
        <form onSubmit={handleAddStaff} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">Name</label>
            <Input className="w-44" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">Role</label>
            <Select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </Select>
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
          <Button type="submit" loading={saving} disabled={newPin.length !== 4}>
            Add staff
          </Button>
        </form>
      </SectionCard>

      <SectionCard icon={<IconUsers />} title="Existing staff" description="Search, edit roles, or reset a PIN.">
        <DataTable
          columns={[
            { header: "Name", skeletonWidth: "w-28" },
            { header: "Role", skeletonWidth: "w-16" },
            { header: "Status", skeletonWidth: "w-16", skeletonVariant: "badge" },
            { header: "Actions", headerClassName: "text-right" },
          ]}
          data={filteredStaff}
          rowKey={(user) => user.id}
          loading={loading}
          error={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(false);
            refreshAll()
              .then(() => setLoadError(false))
              .catch(() => setLoadError(true))
              .finally(() => setLoading(false));
          }}
          search={staffSearch}
          onSearchChange={setStaffSearch}
          searchPlaceholder="Search staff…"
          errorState={{
            title: "Couldn't load staff",
            description: "The staff data didn't come through — check your connection and try again.",
          }}
          empty={{
            icon: <IconUsers />,
            title: staff.length === 0 ? "No staff yet" : "No staff match your search",
            description:
              staff.length === 0
                ? "Add your first staff member using the form above and they'll appear here."
                : "Try a different search term or clear the filter.",
          }}
          renderRow={(user) => {
            const isEditing = editingId === user.id;
            const isResetting = resettingId === user.id;
            const draft = drafts[user.id] ?? { name: user.name, role: user.role };

            return (
              <>
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full label-sm font-semibold ${toneFor(user.id)}`}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </span>
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
                  </div>
                </td>
                <td className="py-4 pr-4">
                  {isEditing ? (
                    <Select
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
                    </Select>
                  ) : (
                    <span className="body-md text-ink-secondary">{roleLabel(user.role)}</span>
                  )}
                </td>
                <td className="py-4 pr-4">
                  <button
                    type="button"
                    onClick={() => user.isActive ? setDeactivatingUser(user) : handleToggleActive(user)}
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
              </>
            );
          }}
        />
      </SectionCard>

      <ConfirmDialog
        open={deactivatingUser !== null}
        title={`Deactivate "${deactivatingUser?.name ?? ""}"?`}
        description="They'll be removed from the PIN login screen immediately. You can reactivate them later without losing their order history."
        confirmLabel="Deactivate"
        tone="warning"
        onConfirm={() => {
          if (deactivatingUser) handleToggleActive(deactivatingUser);
          setDeactivatingUser(null);
        }}
        onCancel={() => setDeactivatingUser(null)}
      />
    </div>
  );
}
