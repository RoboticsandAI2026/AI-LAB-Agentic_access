import * as React from "react";
import { db } from "../firebaseConfig"; // adjust if using "@/firebaseConfig"
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

type UserRow = {
  id: string;        // Firestore doc id (uid)
  uid?: string;
  loginId?: string;
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  photoURL?: string;
  createdAt?: any;   // Firestore Timestamp or undefined
  updatedAt?: any;   // Firestore Timestamp or undefined
};

export default function AdminUsers() {
  const [rows, setRows] = React.useState<UserRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [edits, setEdits] = React.useState<Record<string, Partial<UserRow>>>({}); // per-row edit buffer
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    // Order by createdAt desc (graceful if some docs miss the field)
    const qy = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const data: UserRow[] = snap.docs.map((d) => {
          const v = d.data() as Omit<UserRow, "id">;
          return { id: d.id, ...v };
        });
        setRows(data);
        setLoading(false);
      },
      (err) => {
        console.error("users onSnapshot error:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const onEditChange = (id: string, field: keyof UserRow, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const onStartEdit = (row: UserRow) => {
    setEdits((prev) => ({
      ...prev,
      [row.id]: {
        name: row.name ?? "",
        role: row.role ?? "",
        loginId: row.loginId ?? "",
        phone: row.phone ?? "",
      },
    }));
  };

  const onCancelEdit = (id: string) => {
    setEdits((prev) => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
  };

  const onSave = async (row: UserRow) => {
    const patch = edits[row.id];
    if (!patch) return;

    try {
      setSaving((s) => ({ ...s, [row.id]: true }));
      const ref = doc(db, "users", row.id);
      await updateDoc(ref, {
        name: patch.name ?? row.name ?? "",
        role: patch.role ?? row.role ?? "",
        loginId: patch.loginId ?? row.loginId ?? "",
        phone: patch.phone ?? row.phone ?? "",
        updatedAt: serverTimestamp(),
      });
      // Clear edit buffer for this row after successful save
      onCancelEdit(row.id);
    } catch (e) {
      console.error("Failed to update user:", e);
      alert("Failed to save changes. Check console and Firestore rules.");
    } finally {
      setSaving((s) => ({ ...s, [row.id]: false }));
    }
  };

  const formatTs = (ts?: any) => {
    // Firestore Timestamp -> readable; else "-"
    try {
      if (!ts?.toDate) return "-";
      return ts.toDate().toLocaleString();
    } catch {
      return "-";
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Users</h1>

      {loading ? (
        <div>Loading users…</div>
      ) : rows.length === 0 ? (
        <div>No users found yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ borderCollapse: "collapse", width: "100%" }}
            border={1}
            cellPadding={8}
          >
            <thead>
              <tr>
                <th>UID</th>
                <th>Login ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Created</th>
                <th>Updated</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const editing = !!edits[u.id];
                const buf = edits[u.id] || {};
                const savingThis = !!saving[u.id];

                return (
                  <tr key={u.id}>
                    <td title={u.id}>{u.uid || u.id}</td>

                    <td>
                      {editing ? (
                        <input
                          value={buf.loginId ?? ""}
                          onChange={(e) =>
                            onEditChange(u.id, "loginId", e.target.value)
                          }
                          placeholder="e.g., S123456789 / F1001 / A0001"
                          style={{ width: 160 }}
                        />
                      ) : (
                        u.loginId || "-"
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <input
                          value={buf.name ?? ""}
                          onChange={(e) => onEditChange(u.id, "name", e.target.value)}
                          placeholder="Full name"
                          style={{ width: 180 }}
                        />
                      ) : (
                        u.name || "-"
                      )}
                    </td>

                    <td>
                      {editing ? (
                        <select
                          value={buf.role ?? ""}
                          onChange={(e) => onEditChange(u.id, "role", e.target.value)}
                          style={{ width: 140 }}
                        >
                          <option value="">(unset)</option>
                          <option value="STUDENT">STUDENT</option>
                          <option value="FACULTY">FACULTY</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      ) : (
                        u.role || "-"
                      )}
                    </td>

                    <td>{u.email || "-"}</td>

                    <td>
                      {editing ? (
                        <input
                          value={buf.phone ?? ""}
                          onChange={(e) => onEditChange(u.id, "phone", e.target.value)}
                          placeholder="+91-XXXXXXXXXX"
                          style={{ width: 150 }}
                        />
                      ) : (
                        u.phone || "-"
                      )}
                    </td>

                    <td>{formatTs(u.createdAt)}</td>
                    <td>{formatTs(u.updatedAt)}</td>

                    <td>
                      {!editing ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => onStartEdit(u)}>Edit</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => onSave(u)}
                            disabled={savingThis}
                            style={{ background: "#0ea5e9", color: "white" }}
                          >
                            {savingThis ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => onCancelEdit(u.id)}>Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ marginTop: 12, color: "#666" }}>
            Tip: New Google signups will appear here with blank <em>Login ID</em> and <em>Role</em>.
            Use <strong>Edit → Save</strong> to assign them.
          </p>
        </div>
      )}
    </div>
  );
}
