import React, { useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext';
import { getAuthHeaders } from '../lib/firebase';

interface TeamData {
  ownerEmail: string;
  admins: Array<{ uid: string; email: string; name?: string; role: string }>;
  invites: Array<{ email: string; role: string; invitedBy?: string }>;
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin (sab kuch)' },
  { value: 'ORDER_MANAGER', label: 'Order Manager' },
  { value: 'PRODUCT_MANAGER', label: 'Product Manager' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SUPER_ADMIN', label: 'Super Admin (can also add admins)' },
];

// Owner / admin management. All changes go through the server (SUPER_ADMIN only).
export const AdminTeamPanel: React.FC = () => {
  const { userProfile, firebaseUser, showToast } = useStore();
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('ADMIN');
  const [ownerEmailInput, setOwnerEmailInput] = useState('');

  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
  const myEmail = (firebaseUser?.email || '').toLowerCase();

  const call = async (path: string, body?: object) => {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: await getAuthHeaders(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  };

  const loadTeam = async () => {
    setLoading(true);
    setError(null);
    try {
      setTeam(await call('/api/admin/team'));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="p-4 bg-[#F9F9F7] border-2 border-black/20 text-xs text-[#141413]">
        Only a Super Admin can change admins and the owner login.
      </div>
    );
  }

  const run = async (fn: () => Promise<any>, okMessage: string) => {
    setError(null);
    try {
      await fn();
      showToast(okMessage);
      await loadTeam();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="p-4 sm:p-5 bg-[#F9F9F7] border-2 border-black/20 space-y-5 rounded-xs text-xs text-[#141413]">
      <div>
        <h2 className="text-xs font-black uppercase tracking-wider">Admins &amp; Owner Login</h2>
        <p className="font-semibold mt-1">
          The store owner always has full access. Below you can make other people admins or remove them.
          Admin access is only given to verified emails (Google, or an account with a verified email).
        </p>
      </div>

      {error && <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800">{error}</div>}
      {loading && !team && <div>Loading...</div>}

      {team && (
        <>
          <div className="p-3 bg-white border border-black/15 space-y-2">
            <div className="font-bold">Store owner</div>
            <div className="font-mono">{team.ownerEmail}</div>
            {myEmail === team.ownerEmail && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="email"
                  value={ownerEmailInput}
                  onChange={(e) => setOwnerEmailInput(e.target.value)}
                  placeholder="New owner email"
                  className="px-3 py-2 bg-white border-2 border-black/20 font-mono flex-1 min-w-[200px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const email = ownerEmailInput.trim().toLowerCase();
                    if (!email) return;
                    if (
                      !window.confirm(
                        `Change the owner login from ${team.ownerEmail} to ${email}? You stay a Super Admin until the new owner removes you.`
                      )
                    )
                      return;
                    run(() => call('/api/admin/team/transfer-owner', { email }), 'Owner login changed.').then(() =>
                      setOwnerEmailInput('')
                    );
                  }}
                  className="px-3 py-2 bg-[#141413] text-white font-bold cursor-pointer"
                >
                  Owner badlein
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="font-bold">Admins</div>
            {team.admins.length === 0 && <div className="text-[#575653]">No admins yet.</div>}
            {team.admins.map((a) => (
              <div key={a.uid} className="p-2.5 bg-white border border-black/10 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono">{a.email}</span>
                  {a.name && <span className="text-[#575653]"> · {a.name}</span>}
                  <span className="ml-2 px-1.5 py-0.5 bg-[#C5A059]/20 font-mono font-bold">{a.role}</span>
                </div>
                {a.email !== team.ownerEmail && a.email !== myEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove admin access for ${a.email}?`)) {
                        run(() => call('/api/admin/team/remove', { email: a.email }), 'Admin access removed.');
                      }
                    }}
                    className="px-2.5 py-1 border border-rose-400 text-rose-700 font-semibold cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {team.invites.map((i) => (
              <div key={i.email} className="p-2.5 bg-white border border-dashed border-black/20 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono">{i.email}</span>
                  <span className="ml-2 px-1.5 py-0.5 bg-black/5 font-mono">{i.role}</span>
                  <span className="text-[#575653]"> · becomes an admin on first sign-in</span>
                </div>
                <button
                  type="button"
                  onClick={() => run(() => call('/api/admin/team/remove', { email: i.email }), 'Invite cancelled.')}
                  className="px-2.5 py-1 border border-black/20 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email of the new admin"
              className="px-3 py-2 bg-white border-2 border-black/20 font-mono flex-1 min-w-[200px]"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-3 py-2 bg-white border-2 border-black/20"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const email = newEmail.trim().toLowerCase();
                if (!email) return;
                run(() => call('/api/admin/team/invite', { email, role: newRole }), 'Admin added.').then(() =>
                  setNewEmail('')
                );
              }}
              className="px-3 py-2 bg-[#C5A059] text-[#0B0F17] font-bold cursor-pointer"
            >
              + Admin banayein
            </button>
          </div>
        </>
      )}
    </div>
  );
};
