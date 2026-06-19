"use client";

import { useState } from "react";
import { Modal, ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";

type Member = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  you: boolean;
};
type Invite = { id: string; email: string; role: Role };

const ROLES: Role[] = ["ADMIN", "DEVELOPER", "VIEWER"];

export function TeamClient({
  myRole,
  members,
  invites,
}: {
  myRole: Role;
  members: Member[];
  invites: Invite[];
}) {
  const { success, error } = useToast();
  const [mem, setMem] = useState<Member[]>(members);
  const [inv, setInv] = useState<Invite[]>(invites);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [saving, setSaving] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const canManage = myRole === "OWNER" || myRole === "ADMIN";

  async function invite() {
    if (!email.trim()) return error("Enter an email");
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invite failed");
      setInv((p) => [{ id: Math.random().toString(), email: email.trim().toLowerCase(), role }, ...p]);
      setOpen(false);
      setEmail("");
      success("Invitation sent");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(id: string, newRole: Role) {
    try {
      const res = await fetch(`/api/merchant/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setMem((p) => p.map((x) => (x.id === id ? { ...x, role: newRole } : x)));
    } catch (e) {
      error((e as Error).message);
    }
  }

  async function removeMember(id: string) {
    try {
      const res = await fetch(`/api/merchant/members/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Remove failed");
      setMem((p) => p.filter((x) => x.id !== id));
      success("Member removed");
    } catch (e) {
      error((e as Error).message);
    } finally {
      setRemoveId(null);
    }
  }

  async function cancelInvite(id: string) {
    try {
      const res = await fetch(`/api/merchant/invites/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cancel failed");
      setInv((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      error((e as Error).message);
    }
  }

  return (
    <>
      {canManage && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => setOpen(true)}>
            Invite teammate
          </button>
        </div>
      )}

      <div className="card p-0">
        <ul className="divide-y divide-ink-100">
          {mem.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {x.name ?? x.email}
                  {x.you && <span className="ml-2 text-ink-400">(you)</span>}
                </p>
                <p className="truncate text-xs font-medium text-ink-400">{x.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {canManage && !x.you ? (
                  <select
                    className="input w-auto py-1.5 text-xs"
                    value={x.role}
                    onChange={(e) => changeRole(x.id, e.target.value as Role)}
                  >
                    {(["OWNER", ...ROLES] as Role[]).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                ) : (
                  <span className="badge">{x.role}</span>
                )}
                {canManage && !x.you && (
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => setRemoveId(x.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {inv.length > 0 && (
        <div>
          <p className="label mb-2">Pending invitations</p>
          <div className="card p-0">
            <ul className="divide-y divide-ink-100">
              {inv.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{i.email}</p>
                    <p className="text-xs font-medium text-ink-400">
                      Invited as {i.role.toLowerCase()}
                    </p>
                  </div>
                  {canManage && (
                    <button
                      className="btn-ghost text-xs"
                      onClick={() => cancelInvite(i.id)}
                    >
                      Cancel
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite teammate"
        description="They'll get an email to join with the role you pick."
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={invite} disabled={saving}>
              {saving ? "Sending…" : "Send invite"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              className="input"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <span className="label">Role</span>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={
                    "rounded-xl border px-2 py-2 text-xs font-bold " +
                    (role === r ? "border-black bg-ink-50" : "border-ink-200 hover:bg-ink-50")
                  }
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!removeId}
        title="Remove teammate?"
        description="They'll lose access immediately."
        confirmLabel="Remove"
        onCancel={() => setRemoveId(null)}
        onConfirm={() => removeId && removeMember(removeId)}
      />
    </>
  );
}
